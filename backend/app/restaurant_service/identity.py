"""Who a confirmed sign-in is, in SeatPlan: finding or making the owner (or staff) account.

Supabase proves one thing: this person owns this email address. This module turns that into a
SeatPlan account, in three steps:

1. the same Supabase person signed in before: use the account that was linked then;
2. else an account with that email already exists (an owner or staff member made it earlier, with a
   password): link it, because owning the address is the same proof that account was made with;
3. else make a new owner account.

Nothing is linked or made unless Supabase says the address was confirmed, so signing up with somebody
else's address (and never opening the email) opens nothing.
"""

import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth_providers.supabase import Identity
from app.core.errors import ApiError
from app.events_service.accounts import CONSENT_VERSION
from app.models import AuthIdentity, GuestAccount, Organiser, utc_now
from app.security import hash_password

PROVIDER = "supabase"
# Only these accounts can be reached through the service: an owner, or a staff member.
LINKABLE_ROLES = ("organiser", "staff")


def _refuse() -> ApiError:
    # Same words as a wrong password, so nothing says whether an account exists.
    return ApiError(401, "unauthorised", "Email or password is not correct.")


def organiser_for(session: Session, identity: Identity) -> Organiser:
    """The SeatPlan account for a confirmed identity (made or linked if this is the first time)."""
    if not identity.email_confirmed:
        raise _refuse()
    link = session.scalar(
        select(AuthIdentity).where(
            AuthIdentity.provider == PROVIDER, AuthIdentity.subject == identity.subject
        )
    )
    if link is not None:
        linked = session.get(Organiser, link.organiser_id)
        if linked is not None and linked.role in LINKABLE_ROLES:
            return linked
        raise _refuse()
    organiser = session.scalar(select(Organiser).where(Organiser.email == identity.email))
    if organiser is not None and organiser.role not in LINKABLE_ROLES:
        raise _refuse()
    if organiser is None:
        organiser = Organiser(
            email=identity.email,
            name=identity.name,
            # A password nobody knows: this account is entered through the service only.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="organiser",
        )
        session.add(organiser)
    try:
        session.flush()
        session.add(
            AuthIdentity(
                provider=PROVIDER,
                subject=identity.subject,
                organiser_id=organiser.id,
                email=identity.email,
            )
        )
        session.commit()
    except IntegrityError:
        # Two first sign-ins at once: the other one won, use what it made.
        session.rollback()
        organiser = session.scalar(select(Organiser).where(Organiser.email == identity.email))
        if organiser is None or organiser.role not in LINKABLE_ROLES:
            raise _refuse() from None
        known = session.scalar(
            select(AuthIdentity).where(
                AuthIdentity.provider == PROVIDER, AuthIdentity.subject == identity.subject
            )
        )
        if known is None:
            session.add(
                AuthIdentity(
                    provider=PROVIDER,
                    subject=identity.subject,
                    organiser_id=organiser.id,
                    email=identity.email,
                )
            )
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
    return organiser


def remember_second_step(session: Session, subject: str, enabled: bool) -> None:
    """Keep what the service last said about this person's second step, so the settings page can show it."""
    link = session.scalar(
        select(AuthIdentity).where(
            AuthIdentity.provider == PROVIDER, AuthIdentity.subject == subject
        )
    )
    if link is not None and link.mfa_enabled != enabled:
        link.mfa_enabled = enabled
        session.commit()


def guest_account_for(session: Session, identity: Identity) -> GuestAccount:
    """The diner account for a confirmed identity: the one with that email, else a new one.

    A diner account is the one the events use too (one email, one account), so it is found by its address. Supabase says
    the address is confirmed, which is the same proof the account was made with, so nothing needs linking. A new account
    gets a password nobody knows: it is entered through Google or Apple, or by choosing a new password with the
    emailed code ("Forgot your password?"), which still works.
    """
    if not identity.email_confirmed:
        raise _refuse()
    email = identity.email.strip().lower()
    account = session.scalar(select(GuestAccount).where(GuestAccount.email == email))
    if account is None:
        now = utc_now()
        account = GuestAccount(
            email=email,
            name=(identity.name or email.split("@")[0])[:120],
            password_hash=hash_password(secrets.token_urlsafe(32)),
            consent_at=now,
            consent_version=CONSENT_VERSION,
            last_login_at=now,
            email_proven=True,
        )
        session.add(account)
        try:
            session.commit()
        except IntegrityError:
            # Two first sign-ins at once: the other one won, use what it made.
            session.rollback()
            account = session.scalar(select(GuestAccount).where(GuestAccount.email == email))
            if account is None:
                raise _refuse() from None
        return account
    account.last_login_at = utc_now()
    session.commit()
    return account
