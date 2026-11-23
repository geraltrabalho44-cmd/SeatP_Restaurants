"""Import the Porto restaurant catalogue (15 restaurants) into a local SeatPlan demo database.

    python -m app.seed.porto_catalogue

Same as the Lisbon catalogue: each restaurant has a rating-ready listing, its own room and tables, opening hours, the
position on the map, a Google Maps link and a cover photo with its Wikimedia Commons credit. Menus and reviews come
from `app.seed.lisbon_menus` and `app.seed.demo_reviews`, which fill every demo restaurant. Repeatable: what exists is kept.
"""

from app.seed.lisbon_catalogue import main
from app.seed.lisbon_data import PORTO

if __name__ == "__main__":
    main(PORTO)
