"""Read the Lisbon and Porto demo catalogues and identify their original, credited covers."""

import json
from dataclasses import dataclass
from functools import cache
from hashlib import sha256
from pathlib import Path
from typing import TypedDict

DEMO_ID_PREFIX = "lisbon-demo-"
COVER_ID_PREFIX = "lisbon-cover-"
PORTO_ID_PREFIX = "porto-demo-"
PORTO_COVER_PREFIX = "porto-cover-"


@dataclass(frozen=True)
class Collection:
    """One city's catalogue: its JSON file, its folder of covers and the prefixes of its public ids."""

    name: str
    id_prefix: str
    cover_prefix: str
    file: str
    photo_dir: str


LISBON = Collection(
    "Lisbon", DEMO_ID_PREFIX, COVER_ID_PREFIX, "lisbon_catalogue.json", "lisbon_photos"
)
PORTO = Collection(
    "Porto", PORTO_ID_PREFIX, PORTO_COVER_PREFIX, "porto_catalogue.json", "porto_photos"
)
COLLECTIONS = (LISBON, PORTO)


def is_catalogue_id(public_id: str) -> bool:
    """True for a restaurant that comes from one of the city catalogues (real businesses, invented bookings)."""
    return public_id.startswith(tuple(item.id_prefix for item in COLLECTIONS))


class Cover(TypedDict):
    file: str
    url: str
    author: str
    license: str
    license_url: str
    alt: str


class Listing(TypedDict):
    slug: str
    name: str
    address: str
    location: list[float]
    source: str
    cuisines: list[str]
    description: str
    pin_source: str
    price_level: int
    price_source: str
    photo: Cover


@cache
def catalogue(collection: Collection = LISBON) -> list[Listing]:
    return json.loads(Path(__file__).with_name(collection.file).read_text(encoding="utf-8"))


def _listing_key(slug: str) -> str:
    return sha256(slug.encode()).hexdigest()[:16]


def venue_id(slug: str, collection: Collection = LISBON) -> str:
    return collection.id_prefix + _listing_key(slug)


def cover_id(slug: str, collection: Collection = LISBON) -> str:
    return collection.cover_prefix + _listing_key(slug)


@cache
def _covers_by_id() -> dict[str, Cover]:
    return {
        cover_id(listing["slug"], collection): listing["photo"]
        for collection in COLLECTIONS
        for listing in catalogue(collection)
    }


def cover_credit(public_id: str) -> dict[str, str] | None:
    if not public_id.startswith(tuple(item.cover_prefix for item in COLLECTIONS)):
        return None
    cover = _covers_by_id().get(public_id)
    if cover is None:
        return None
    return {key: cover[key] for key in ("file", "author", "license", "license_url")}
