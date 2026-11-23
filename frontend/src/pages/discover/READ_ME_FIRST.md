# discover: read me first

The home page (`/`): find a restaurant (spec 9.1). The old home page with the demo links lives at `/demo`.

- `DiscoverBar.tsx` is the one sticky command bar; `ContextControls.tsx` is where and when (a capsule in the bar on a wide screen, stacked in the drawer on a phone); `FilterDrawer.tsx` is the drawer (cuisine, price, wheelchair access, available at that time); `Chips.tsx` are the toggles.
- `DiscoverPage.tsx` holds the state (search text with a 300 ms pause, cuisine/price/feature chips, the place, the optional "When?", paging) and asks `GET /api/restaurants`. Twenty results at a time; "Show more" asks for the next offset and appends.
- `RestaurantCard.tsx` is one result. Features are written in words. With "When?" it shows up to three free times that open `/restaurants/<slug>?date=&time=&party=`.
- `discoverModel.ts` is the pure part: cities with fixed coordinates, labels, distance text, the card link, and the place kept in `sessionStorage` for the tab. Unit tested in `discoverModel.test.ts`.
- `PublicHeaderActions.tsx` is the right side of the header on public pages ("For restaurant owners" and Log in; a Menu button on a phone). The language control is not here: it is in `PageShell`.
- The map is `maps/ResultsMap.tsx`, loaded lazily; it is drawn only on a wide screen or when the diner switches to Map.

The place is chosen from the city list only: there is no "Near me" button (it was removed), so the browser is never asked for the location. A city shows the restaurants up to 25 km from it.
Only published restaurants with a slug are listed by the server.
