"""A diner makes an account from the restaurant side, with no event link.

It is the same account events use (a guest account), so one sign-in works on both sides, and the code
step is the same one (/guest/verify). Only the first half lives here: store a pending sign-up and email
the code, or tell an existing account holder. Nothing in the events code changes: a code row without an
event simply joins no event when it is finished.
"""

from sqlalchemy.orm import Session

from app.events_service import accounts
from app.mail import templates
from app.models import utc_now
from app.security import hash_password, keyed_hash, mailbox, new_token


def start(
    session: Session, name: str, email: str, password: str, show_code: bool
) -> tuple[str, str | None, str]:
    """Store the pending sign-up and queue its code, or queue a note for an existing account.

    Returns (the outbox key to send now, the code or None, the sign-up id). Commits. The caller gives
    the same 202 either way, so nobody learns who has an account. The code is returned only when
    `show_code` is true (the demo).
    """
    # Only this browser gets the id back; the pending sign-up can be finished only with it.
    signup_id = new_token()
    # Hashed in both branches, so the time taken does not tell who has an account.
    password_hash = hash_password(password)
    link = accounts.sign_in_link()
    existing = accounts.find_account(session, email)
    if existing is not None:
        hour = utc_now().strftime("%Y%m%d%H")
        key = f"account-exists:{keyed_hash('mailbox:' + mailbox(email))[:32]}:{hour}"
        parts = templates.diner_account_exists(existing.name, link)
        accounts._queue(session, key, "account_exists", email, parts)
        session.commit()
        return key, None, signup_id
    row, code = accounts._new_code_row(
        session,
        email,
        "register",
        name=name,
        password_hash=password_hash,
        signup_hash=accounts._signup_hash(signup_id),
        code_shown=show_code,
    )
    key = accounts._code_key(row)
    accounts._queue(
        session,
        key,
        accounts.CODE_KIND["register"],
        email,
        templates.diner_account_code(code, link),
    )
    session.commit()
    return key, (code if show_code else None), signup_id
