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
from app.models import AuthIdentity, Organiser
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
