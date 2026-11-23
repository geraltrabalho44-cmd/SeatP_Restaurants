"""The two accounts anybody can try the site with: consumer@example.com (a guest) and owner@example.com (an owner)."""

import pytest
from conftest import make_user
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DinerFavorite, GuestAccount, Organiser, Venue
from app.seed import access_accounts, lisbon_catalogue, owner_demo
from app.seed.lisbon_data import LISBON, PORTO
from app.seed.run import DEMO_ORGANISER_EMAIL


def _catalogue(session: Session) -> None:
    owner = make_user(session, DEMO_ORGANISER_EMAIL)
    lisbon_catalogue.seed(session, owner, LISBON)
    lisbon_catalogue.seed(session, owner, PORTO)
    session.flush()


def test_both_accounts_can_sign_in_with_their_short_passwords(
    client: TestClient, session: Session
) -> None:
    _catalogue(session)
    access_accounts.run(session)
    session.commit()

    guest = client.post(
        "/api/guest/login", json={"email": "consumer@example.com", "password": "consumer"}
    )
    assert guest.status_code == 200, guest.text
    owner = client.post("/api/auth/login", json={"email": "owner@example.com", "password": "owner"})
    assert owner.status_code == 200, owner.text
    assert owner.json()["user"]["role"] == "organiser"
    # And a wrong password is still refused.
    assert (
        client.post(
            "/api/auth/login", json={"email": "owner@example.com", "password": "nope"}
        ).status_code
        == 401
    )


def test_running_it_twice_adds_nothing_and_resets_the_passwords(
    client: TestClient, session: Session
) -> None:
    _catalogue(session)
    access_accounts.run(session)
    session.commit()
    guest = session.scalars(
        select(GuestAccount).where(GuestAccount.email == "consumer@example.com")
    ).one()
    guest.password_hash = "changed"
    session.commit()
    access_accounts.run(session)
    session.commit()
    assert (
        session.scalar(
            select(func.count())
            .select_from(GuestAccount)
            .where(GuestAccount.email == "consumer@example.com")
        )
        == 1
    )
    assert (
        session.scalar(
            select(func.count())
            .select_from(Organiser)
            .where(Organiser.email == "owner@example.com")
        )
        == 1
    )
    assert session.scalar(select(func.count()).select_from(DinerFavorite)) == len(
        access_accounts.SAVED
    )
    assert (
        client.post(
            "/api/guest/login", json={"email": "consumer@example.com", "password": "consumer"}
        ).status_code
        == 200
    )


def test_the_guest_has_saved_restaurants_and_cannot_take_over_an_invited_guest(
    session: Session,
) -> None:
    _catalogue(session)
    access_accounts.run(session)
    guest = session.scalars(
        select(GuestAccount).where(GuestAccount.email == "consumer@example.com")
    ).one()
    assert guest.email_proven is False
    saved = session.scalars(
        select(DinerFavorite.venue_id).where(DinerFavorite.account_id == guest.id)
    ).all()
    slugs = set(session.scalars(select(Venue.slug).where(Venue.id.in_(saved))))
    assert slugs == set(access_accounts.SAVED)


def test_the_owner_gets_the_four_restaurants_when_owner_demo_runs(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(owner_demo, "HISTORY_DAYS", 7)
    _catalogue(session)
    access_accounts.run(session)
    owner_demo.run(session)
    owner = session.scalars(select(Organiser).where(Organiser.email == "owner@example.com")).one()
    mine = set(session.scalars(select(Venue.slug).where(Venue.organiser_id == owner.id)))
    assert mine == set(owner_demo.KEEP) and len(mine) == 4
