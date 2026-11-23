"""Scheduled work with no cron: it runs when the site is used.

There used to be a GitHub Actions job that called POST /internal/email/process every 15
minutes. That needed two secrets and a free-plan workaround, so now the work rides on the
site's own traffic instead (the project is a student demo, so "eventually" is fine):

- right after any change that went through (a booking, a change, a cancellation), the emails
  that are due are sent, so a confirmation reaches the diner at once;
- on any request, at most once a minute per server instance, the other chores run: emails that
  became due (reminders), retention of old emails, expired sign-up codes, deposits nobody paid,
  phone messages and the automatic offers.

If nobody uses the site, a reminder waits until the next visit. Nothing here may ever make a
request fail: any error is logged and the work is tried again on a later request.
POST /internal/email/process (with its secret) still exists to run the same chores by hand.
"""

import logging
import threading
import time
from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.mail.outbox import ProcessReport, process_due, scrub_expired
from app.mail.providers import provider_from_settings
from app.models import EmailCode, utc_now
from app.restaurant_service import booking_payments, offers, phone_messages

log = logging.getLogger("seatplan.scheduler")

CHORES_EVERY_S = 60.0
INLINE_BATCH = 5  # right after a change: only a few emails, so the answer stays quick
FULL_BATCH = 20
_CHANGING = {"POST", "PUT", "PATCH", "DELETE"}

_lock = threading.Lock()
_last_chores: float | None = None


def reset() -> None:
    """Forget when the chores last ran (for tests: "a minute has passed")."""
    global _last_chores
    with _lock:
        _last_chores = None


def send_due_emails(session: Session, now: datetime, batch: int = FULL_BATCH) -> ProcessReport:
    """Send the emails whose time has come (the allowlist and retries are process_due's job)."""
    return process_due(session, provider_from_settings(get_settings()), now, batch)


def _guarded(session: Session, name: str, work: object) -> None:
    """Run one chore; whatever happens, the next chore and the request go on."""
    try:
        work()  # type: ignore[operator]
    except Exception:
        session.rollback()
        logging.getLogger(f"seatplan.{name}").exception("%s failed", name)


def housekeeping(session: Session, now: datetime) -> None:
    """Everything except sending emails. Each part is on its own, so one failure stops no other."""

    def retention() -> None:
        scrub_expired(session, now)  # finished emails older than 30 days lose their words (S9)
        # Codes nobody typed in time (guest accounts) are of no more use.
        session.execute(delete(EmailCode).where(EmailCode.expires_at <= now))
        session.commit()

    _guarded(session, "retention", retention)
    # Give tables back where a deposit was never paid, and retry refunds that failed.
    _guarded(session, "payments", lambda: booking_payments.sweep(session, now))
    # Phone reminders and notices that are due, and forget old numbers.
    _guarded(session, "messages", lambda: phone_messages.sweep(session, now))
    # Automatic offers (win-back, welcome, Nth visit) to guests who said yes to them.
    _guarded(session, "offers", lambda: offers.sweep_auto(session, now))


def run_chores(session: Session, now: datetime) -> ProcessReport:
    """Send what is due, then do the housekeeping. Used on traffic and by the secret endpoint."""
    report = send_due_emails(session, now, FULL_BATCH)
    housekeeping(session, now)
    return report


def _claim_chores() -> bool:
    """True for the first caller in each minute (per server instance); the others skip."""
    global _last_chores
    moment = time.monotonic()
    with _lock:
        if _last_chores is not None and moment - _last_chores < CHORES_EVERY_S:
            return False
        _last_chores = moment
        return True


def after_request(method: str, path: str, status: int) -> None:
    """Called by the middleware once an answer is built. Never raises."""
    try:
        if not get_settings().send_on_request:
            return
        # Only the API; not the secret endpoint, and not a live stream that stays open.
        if not path.startswith("/api/") or path.startswith("/api/internal/"):
            return
        if path.endswith("/stream"):
            return
        send_now = method in _CHANGING and status < 400
        chores = _claim_chores()
        if not send_now and not chores:
            return
        now = utc_now()
        session = db.new_session()
        try:
            if send_now:
                send_due_emails(session, now, INLINE_BATCH)
            if chores:
                run_chores(session, now)
        finally:
            session.close()
    except Exception:
        log.exception("background work after a request failed")
