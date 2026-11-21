"""The sample menus of the demo restaurants: every menu is valid for the menu API, covers the same four sections,
belongs to a restaurant of the catalogue, and seeding twice never overwrites a menu."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Organiser, RestaurantMenu, Venue
from app.routers.menus import MenuIn
from app.security import hash_password
from app.seed import lisbon_menus

CATALOGUE = Path(lisbon_menus.__file__).with_name("lisbon_catalogue.json")
MADE_UP = {"casa-lumen", "tagus-terrace", "patio-das-laranjeiras", "miradouro-7", "tasca-do-bairro"}


def test_every_lisbon_restaurant_has_a_menu_and_nothing_else_is_named() -> None:
    slugs = {entry["slug"] for entry in json.loads(CATALOGUE.read_text(encoding="utf-8"))}
    assert slugs <= set(lisbon_menus.MENUS)
    assert set(lisbon_menus.MENUS) - slugs == MADE_UP | {"casa-guedes"}


def test_every_menu_is_valid_for_the_menu_api_and_has_the_four_sections() -> None:
    for slug, rows in lisbon_menus.MENUS.items():
        body = MenuIn.model_validate({"version": 0, "items": lisbon_menus._items(rows)})
        categories = {item.category for item in body.items}
        assert categories <= {"Starters", "Mains", "Desserts", "Drinks"}, slug
        assert {"Starters", "Mains", "Desserts", "Drinks"} <= categories, slug
        assert 8 <= len(body.items) <= 14, slug
        assert all(item.price_cents > 0 for item in body.items), slug
        assert len({item.name for item in body.items}) == len(body.items), slug  # no dish twice


def _restaurant(session: Session, slug: str) -> Venue:
    owner = session.query(Organiser).first()
    if owner is None:
        owner = Organiser(
            email="o@example.com",
            name="O",
            password_hash=hash_password("a long password"),
            role="organiser",
        )
        session.add(owner)
        session.flush()
    venue = Venue(
        name=slug,
        kind="restaurant",
        slug=slug,
        public_id=f"pub-{slug}",
        organiser_id=owner.id,
        width=1000,
        height=700,
    )
    session.add(venue)
    session.flush()
    return venue


def test_seeding_fills_empty_menus_and_keeps_an_existing_one(session: Session) -> None:
    empty = _restaurant(session, "casa-lumen")
    kept = _restaurant(session, "tagus-terrace")
    session.add(RestaurantMenu(venue_id=kept.id, version=3, items=[{"name": "Mine"}]))
    session.commit()
    written, missing = lisbon_menus.seed(session)
    session.commit()
    assert written == 1 and missing == len(lisbon_menus.MENUS) - 2
    assert len(session.get(RestaurantMenu, empty.id).items) >= 8
    assert session.get(RestaurantMenu, kept.id).items == [{"name": "Mine"}]
    assert lisbon_menus.seed(session)[0] == 0  # again: nothing to do
