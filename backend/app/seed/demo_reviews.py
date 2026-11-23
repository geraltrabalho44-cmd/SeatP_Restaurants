"""Add sample reviews to the demo restaurants.

Every review is written from pieces (a line about the food that fits the kind of kitchen, one about the service, the table or the
price, a closing line), at a score that follows the restaurant's own level, by one of ~100 different guests, so no two
restaurants read alike. The first version wrote 68 sentences into 476 reviews; those (and only those: written by the seed's own
guests) are replaced.

The reviews read like ordinary ones, so the site looks right when it is presented. With `--label` every review
starts with "Demo review" instead (and a plain run removes that label again). The site says "Demo · Nova SBE Programming" on its landing page and
"Demo data only" in every footer; keep that if the site is ever shown beyond the course, because the Lisbon
catalogue lists real businesses and their reviews and availability are invented.
"""

import argparse
from datetime import timedelta
from random import Random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import GuestAccount, RestaurantReview, Venue, utc_now

LABEL = "Demo review — "

FIRST_NAMES = (
    "Inês", "Rui", "Leonor", "Tiago", "Marta", "Nuno", "Sofia", "Afonso", "Clara", "André", "Beatriz", "Miguel",
    "Carolina", "João", "Diana", "Tomás", "Vera", "Francisco", "Helena", "Pedro", "Rita", "Gonçalo", "Mariana",
    "Duarte", "Catarina", "Bruno", "Joana", "Filipe", "Teresa", "Ricardo", "Patrícia", "Daniel", "Alice",
    "Henrique", "Lara", "Hugo", "Matilde", "Sérgio", "Ana", "Paulo", "Emma", "Lucas", "Sara", "Oliver", "Chloé",
    "Marco", "Julia", "David",
)  # fmt: skip
SURNAME_INITIALS = ("A", "C", "F", "M", "R", "S")
LEGACY_DOMAIN = (
    "demo.seatplan.invalid"  # the guests of the first version; their reviews are replaced
)
DOMAIN = "seatplan.invalid"
NAMES = tuple(
    f"{first} {SURNAME_INITIALS[(index * 5 + index // 8 + (index // len(FIRST_NAMES)) * 3) % len(SURNAME_INITIALS)]}."
    for index, first in enumerate(FIRST_NAMES * 2)
)

# What the first version wrote, kept only to recognise it.
LEGACY_SENTENCES = (
    "Our table felt cramped once the plates arrived.",
    "The dining room was too lively for our plans.",
    "The table was fine for a quick meal.",
    "A comfortable seat, though a quieter spot would be better.",
    "Good spacing between tables and easy conversation.",
    "The room worked well for an unhurried dinner.",
    "We could talk easily and had plenty of room at the table.",
    "The table was a great fit for our evening.",
    "The terrace felt exposed when the wind picked up.",
    "We would choose an inside table next time.",
    "The terrace worked for lunch, though we would have preferred more shade.",
    "The terrace was a nice spot for an early dinner.",
    "We liked the open-air table and the room around it.",
    "An outdoor table made the evening for us.",
    "The terrace was exactly what we wanted for a long lunch.",
    "The window spot looked better suited to a quieter time.",
    "The window made the table bright, with less privacy than we expected.",
    "We enjoyed the light from the window and the space to share plates.",
    "The window table had lovely light throughout lunch.",
    "We would ask for this window spot again.",
    "We wanted more space around the table.",
    "We could use the table, although the approach felt tight.",
    "There was space to get to the table without asking people to move.",
    "The clear space around our table made the visit easy.",
)

# How the food reads, by kind of kitchen and by how the guest felt: "up" (8 to 10), "mid" (5 to 7), "down" (1 to 4).
FOOD = {
    "seafood": {
        "up": (
            "The grilled sea bream was cooked perfectly and tasted of the sea.",
            "Clams in garlic and white wine, and we mopped up the sauce with all the bread.",
            "Fresh prawns, simply done, and a tasty rice with shellfish to follow.",
            "The fish of the day came out moist, with potatoes that had clearly been looked after.",
            "Barnacles and a cold beer: exactly the kind of meal we came for.",
            "The octopus was tender and the seafood rice was the best we have had in the city.",
        ),
        "mid": (
            "The seafood was fresh, though a couple of dishes needed more seasoning.",
            "Good clams, but the grilled fish arrived a little dry.",
            "The prawns were good, the rice a bit heavy for the price.",
            "Honest fish, nothing that surprised us.",
            "The shellfish was the highlight, the sides less so.",
        ),
        "down": (
            "The fish was overcooked and the portion small for what we paid.",
            "The shellfish was not as fresh as we hoped.",
            "Our rice was sticky and short of seafood.",
            "The grilled fish had little flavour and the sides were cold.",
        ),
    },
    "portuguese": {
        "up": (
            "The bacalhau was properly done, flaky and not too salty.",
            "Roast pork with crisp skin and the best potatoes we had all week.",
            "A rich stew that tasted like it had been on the stove all morning.",
            "The grilled sausage and the bean stew were generous and full of flavour.",
            "Soup to start, a good fish after, and a sweet egg pudding that finished us off.",
            "Every plate felt like home cooking, in the best sense.",
        ),
        "mid": (
            "The food was decent and traditional, though a bit heavy.",
            "My stew was good, my friend's fish a little plain.",
            "Generous portions, but the cooking was uneven from plate to plate.",
            "The classics are all there, only some are better than others.",
            "Good bread and olives, and the mains were fine.",
        ),
        "down": (
            "The bacalhau was too salty and the chips were soggy.",
            "The meat was tough and the sauce had little taste.",
            "Portions were small and the dishes came out lukewarm.",
            "A tired version of dishes that deserve better.",
        ),
    },
    "cafe": {
        "up": (
            "The custard tarts were still warm and the coffee was properly strong.",
            "A flaky pastry and a perfect espresso: a lovely way to start the day.",
            "The toasted sandwich was crisp and the hot chocolate thick and rich.",
            "The cakes under the glass looked good and tasted even better.",
            "A proper breakfast, with fresh juice and good bread.",
        ),
        "mid": (
            "Good coffee and pastries, a little pricey for what they are.",
            "The cakes were nice, the sandwich less memorable.",
            "Fine for a quick coffee and something sweet.",
            "A pleasant breakfast, though the bread was not very fresh.",
        ),
        "down": (
            "The coffee was bitter and the pastry dry.",
            "We paid a lot for a sandwich that was not very good.",
            "The cakes looked better than they tasted.",
        ),
    },
    "japanese": {
        "up": (
            "The sushi was fresh and balanced, with rice at the right temperature.",
            "Sashimi so clean we ordered a second plate, and the miso soup was comforting.",
            "The tempura was light and crisp, and the grilled fish was a treat.",
            "A careful, quiet meal, with every piece cut with care.",
        ),
        "mid": (
            "The fish was good but some rolls were too heavy on the rice.",
            "A decent selection, though we expected more for the price.",
            "Nice sashimi, a forgettable tempura.",
        ),
        "down": (
            "The rice was dry and the fish lacked freshness.",
            "Small pieces, big bill, and not much flavour.",
        ),
    },
    "italian": {
        "up": (
            "The pasta was cooked just right, and the sauce tasted of tomatoes and basil.",
            "A thin, charred pizza base with plenty of flavour on top.",
            "The risotto was creamy and the tiramisu was gone in two minutes.",
            "Fresh pasta and a short, well-chosen wine list.",
        ),
        "mid": (
            "Good pizza, though the toppings were a little sparse.",
            "The pasta was fine, the dessert better than the main.",
            "A solid neighbourhood Italian, with nothing to complain about and nothing to remember.",
        ),
        "down": (
            "The pasta was overcooked and the sauce bland.",
            "The pizza arrived cold with a soft base.",
        ),
    },
    "modern": {
        "up": (
            "A tasting menu that kept surprising us, each plate better composed than the last.",
            "Beautifully presented dishes with flavours that made sense together.",
            "The tasting dishes were precise, and the dessert was the best part of the night.",
            "Thoughtful cooking with local ingredients, and the wine pairings were spot on.",
            "We tried the set menu and every course had something to talk about.",
        ),
        "mid": (
            "Some dishes were excellent, others clever but not very tasty.",
            "Lovely plating, though a few plates were a little too small.",
            "A good meal that did not quite match the price.",
            "The starters were the highlight, the mains less so.",
        ),
        "down": (
            "Expensive for what arrived on the plate, and some dishes were lukewarm.",
            "The dishes tried too hard and the flavours did not come together.",
            "We left hungry and a good deal poorer.",
        ),
    },
}  # fmt: skip
KITCHEN = {
    "seafood": "seafood", "fish": "seafood", "portuguese": "portuguese", "petiscos": "portuguese",
    "grill": "portuguese", "cafe": "cafe", "japanese": "japanese", "italian": "italian", "pizza": "italian",
    "french": "modern", "fusion": "modern", "mediterranean": "modern",
}  # fmt: skip

SERVICE = {
    "up": (
        "The staff were friendly and never rushed us.",
        "Our waiter knew the menu well and made good suggestions.",
        "Service was quick and warm from the moment we sat down.",
        "They looked after us really well, even when the room filled up.",
        "Attentive without hovering.",
        "They found us a table at the last minute and were lovely about it.",
        "A welcome that made us feel like regulars.",
    ),
    "mid": (
        "Service was friendly but slow when it got busy.",
        "The staff were polite, though we waited a while for the bill.",
        "A little disorganised at the start, then it settled down.",
        "Pleasant enough service.",
        "We had to ask twice for water.",
    ),
    "down": (
        "We waited far too long between courses.",
        "The service felt rushed and a little cold.",
        "Nobody seemed to know who was serving our table.",
        "We had to chase the staff for almost everything.",
    ),
}

PRICE = {
    1: ("Very fair prices.", "Hard to beat for the money.", "Cheap and cheerful in the best way."),
    2: ("Good value for what you get.", "Reasonable prices for the portions.", "Fair for the neighbourhood."),
    3: ("Not cheap, but worth it.", "A little expensive, though you can taste the quality.", "Priced for a treat."),
    4: ("Pricey, but a real occasion.", "You pay for the experience, and mostly it delivers.", "A special-night bill."),
}  # fmt: skip

CLOSERS = {
    "up": (
        "We will be back.",
        "Already planning our next visit.",
        "Booking was easy and it was worth the trip.",
        "Would recommend to anyone visiting.",
        "A lovely evening from start to finish.",
        "Our favourite meal of the trip.",
        "We brought friends the next week.",
    ),
    "mid": (
        "A fair place for a meal, if not a special one.",
        "We might come back for something different.",
        "Fine overall.",
        "Good, with room to be better.",
    ),
    "down": (
        "Probably not for us.",
        "We left a little disappointed.",
        "We will try somewhere else next time.",
    ),
}

# What the table and the room felt like, for the guests who mention where they sat.
COMMENTS = {
    "general": {
        "down": (
            "Our table felt cramped once the plates arrived.",
            "The dining room was louder than we expected.",
            "We were seated close to the door and felt every draught.",
        ),
        "mid": (
            "The table was fine, though a quieter spot would have been better.",
            "A comfortable seat for a quick meal.",
            "A little close to the next table, but we managed.",
        ),
        "up": (
            "Good spacing between tables and easy conversation.",
            "Our table was just right for a long dinner.",
            "We could talk easily and had plenty of room.",
            "A calm corner of the room, exactly what we asked for.",
            "A cosy room, and our table was well placed.",
        ),
    },
    "terrace": {
        "down": (
            "The terrace felt exposed when the wind picked up.",
            "We would choose an inside table next time.",
        ),
        "mid": ("The terrace worked for lunch, though we would have liked more shade.",),
        "up": (
            "The terrace was a nice spot for an early dinner.",
            "An outdoor table made the evening for us.",
            "We had a long lunch on the terrace and did not want to leave.",
        ),
    },
    "window": {
        "down": ("The window seat was bright but gave little privacy.",),
        "mid": ("The window made the table bright, with less privacy than we expected.",),
        "up": (
            "We enjoyed the light from the window and watching the street go by.",
            "The window table had lovely light all through lunch.",
            "We would ask for the window table again.",
        ),
    },
    "accessible": {
        "down": ("We wanted more space around the table.",),
        "mid": ("We could use the table, although the approach felt tight.",),
        "up": (
            "There was room to reach the table without asking anyone to move.",
            "The clear space around our table made the visit easy.",
            "The table was easy to reach with a wheelchair, and the staff made room without being asked.",
        ),
    },
}  # fmt: skip


def tone_of(score: int) -> str:
    return "up" if score >= 8 else "mid" if score >= 5 else "down"


def write_comment(random: Random, kitchen: str, price: int, table_type: str, score: int) -> str:
    """One review, written from a few pieces; the pieces and their order differ from review to review."""
    tone = tone_of(score)
    food = random.choice(FOOD[kitchen][tone])
    service = random.choice(SERVICE[tone])
    table = random.choice(COMMENTS[table_type][tone])
    money = random.choice(PRICE[price]) if tone != "down" else "Not worth the price for us."
    closer = random.choice(CLOSERS[tone])
    shape = random.choice(
        (
            (food, service),
            (food, table),
            (food, money),
            (service, closer),
            (food, service, closer),
            (table, food),
            (food, money, closer),
            (service, food),
            (food, table, closer),
        )
    )
    return " ".join(shape)


def is_legacy(comment: str) -> bool:
    """True for a review written by the first version of this seed (68 sentences, repeated)."""
    text = comment.removeprefix(LABEL)
    return any(text.startswith(sentence) for sentence in LEGACY_SENTENCES)


# The average these restaurants are meant to show (the scale is 0 to 10). Their reviews are shifted to match it.
TARGET_AVERAGES = {"casa-da-india": 4.9}


def apply_target_averages(session: Session) -> int:
    """Give each restaurant in TARGET_AVERAGES the average it should show, by moving its review scores by at most a point
    or two: the lowest scores stay the lowest. Returns how many restaurants were changed. Repeatable."""
    changed = 0
    for slug, target in TARGET_AVERAGES.items():
        venue = session.scalar(select(Venue).where(Venue.slug == slug, Venue.kind == "restaurant"))
        if venue is None:
            continue
        reviews = list(
            session.scalars(
                select(RestaurantReview)
                .where(RestaurantReview.venue_id == venue.id)
                .order_by(RestaurantReview.score, RestaurantReview.public_id)
            )
        )
        if not reviews:
            continue
        total = round(target * len(reviews))
        base, extra = divmod(total, len(reviews))
        for index, review in enumerate(reviews):
            score = base + (1 if index >= len(reviews) - extra else 0)
            if review.score != score:
                review.score = score
                changed += 1
    return changed


def seed(session: Session, plain: bool = True) -> tuple[int, int]:
    """Add reviews. `plain` (the default) leaves out the per-review "Demo review" label."""
    venues = session.scalars(
        select(Venue)
        .where(Venue.kind == "restaurant", Venue.is_demo.is_(True), Venue.status == "published")
        .order_by(Venue.id)
    ).all()
    if not venues:
        return 0, 0

    now = utc_now()
    accounts = []
    for index, name in enumerate(NAMES, 1):
        email = f"reviewer-{index}@{DOMAIN}"
        db.insert_ignoring_duplicates(
            session,
            GuestAccount.__table__,
            {
                "email": email,
                "name": name,
                "password_hash": "disabled",
                "email_proven": False,
                "consent_at": now,
                "consent_version": "demo",
            },
        )
        accounts.append(
            session.scalars(select(GuestAccount).where(GuestAccount.email == email)).one()
        )

    venue_ids = [venue.id for venue in venues]
    # Reviews written by the first version of this seed (its own guests, its repeated sentences) are replaced.
    legacy_accounts = select(GuestAccount.id).where(
        GuestAccount.email.endswith(f"@{LEGACY_DOMAIN}")
    )
    for old in session.scalars(
        select(RestaurantReview).where(
            RestaurantReview.venue_id.in_(venue_ids),
            RestaurantReview.account_id.in_(legacy_accounts),
        )
    ):
        if is_legacy(old.comment):
            session.delete(old)
    session.flush()
    existing = set(
        session.execute(
            select(RestaurantReview.venue_id, RestaurantReview.account_id).where(
                RestaurantReview.venue_id.in_(venue_ids)
            )
        ).tuples()
    )
    added = 0
    seen: set[str] = set(
        session.scalars(
            select(RestaurantReview.comment).where(RestaurantReview.venue_id.in_(venue_ids))
        )
    )
    for venue in venues:
        random = Random(venue.public_id)
        features = venue.features or {}
        table_types = ["general"] * 4
        table_types.extend(
            kind
            for kind, feature in (
                ("terrace", "terrace"),
                ("window", "view"),
                ("accessible", "accessible"),
            )
            if features.get(feature)
        )
        kitchen = next(
            (KITCHEN[name] for name in (venue.cuisines or []) if name in KITCHEN), "portuguese"
        )
        price = min(4, max(1, venue.price_level or 2))
        # Each restaurant has a level of its own, so their averages differ: from a modest 6 to a very good 9.
        level = TARGET_AVERAGES.get(venue.slug, random.uniform(6.2, 9.0))
        contributors = random.sample(accounts, random.randint(10, 17))
        for index, account in enumerate(contributors, 1):
            score = min(10, max(1, round(random.gauss(level, 1.6))))
            table_type = random.choice(table_types)
            comment = write_comment(random, kitchen, price, table_type, score)
            for _ in range(40):  # no two reviews, in any restaurant, are the same
                if comment not in seen:
                    break
                comment = write_comment(random, kitchen, price, table_type, score)
            seen.add(comment)
            comment = ("" if plain else LABEL) + comment
            created_at = now - timedelta(days=random.randint(1, 85), hours=random.randint(0, 23))
            if (venue.id, account.id) not in existing:
                db.insert_ignoring_duplicates(
                    session,
                    RestaurantReview.__table__,
                    {
                        "venue_id": venue.id,
                        "account_id": account.id,
                        "score": score,
                        "comment": comment,
                        "table_type": table_type,
                        "verified": False,
                        "created_at": created_at,
                    },
                )
                added += 1
    if plain:
        for review in session.scalars(
            select(RestaurantReview).where(
                RestaurantReview.venue_id.in_(venue_ids), RestaurantReview.comment.startswith(LABEL)
            )
        ):
            review.comment = review.comment[len(LABEL) :]
    apply_target_averages(session)
    return len(venues), added


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--label",
        action="store_true",
        help="start each review with 'Demo review' (default: no label)",
    )
    parser.add_argument(
        "--plain", action="store_true", help="no 'Demo review' label (already the default)"
    )
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="also run on a Postgres database (only a database that holds nothing but demo data)",
    )
    args = parser.parse_args()
    settings = get_settings()
    local = settings.demo_mode and settings.database_url.startswith("sqlite:")
    if not local and not args.allow_remote:
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or pass --allow-remote."
        )
    db.init_engine(settings.database_url)
    db.create_all()
    with db.new_session() as session:
        venues, reviews = seed(session, plain=not args.label)
        session.commit()
    print(f"Reviews: {reviews} added across {venues} published demo restaurants.")


if __name__ == "__main__":
    main()
