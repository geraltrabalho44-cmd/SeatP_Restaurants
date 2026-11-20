// The restaurant beside a confirmation or a managed booking: cover photo, name and address. The date, time and
// guests are not repeated here: the booking's own rows next to this card already say them. The photo and address come
// from the public page of the restaurant; when that cannot be loaded the card still shows the name.
import { useEffect, useState } from "react";
import { getPublicRestaurant } from "../../api/discovery";
import type { PublicRestaurant } from "../../api/discovery";
import { getRestaurant } from "../../api/restaurant";
import type { BookingView } from "../../api/restaurant";
import { useT } from "../../i18n/I18nProvider";

/** The public page of the restaurant a booking is at, or null while loading and when it has none. */
export function usePublicVenue(venuePublicId: string): PublicRestaurant | null {
  const [venue, setVenue] = useState<PublicRestaurant | null>(null);
  useEffect(() => {
    let live = true;
    getRestaurant(venuePublicId)
      .then((info) => (info.slug ? getPublicRestaurant(info.slug) : null))
      .then((page) => {
        if (live) setVenue(page);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [venuePublicId]);
  return venue;
}

export function DirectionsLink({ venue }: { venue: PublicRestaurant | null }) {
  const { t } = useT();
  if (!venue?.maps_url) return null;
  return (
    <a className="btn btn-secondary" href={venue.maps_url} target="_blank" rel="noopener noreferrer">
      {t("Get directions")} <span aria-hidden="true">{"\u2197"}</span>
      <span className="visually-hidden"> ({t("opens in a new tab")})</span>
    </a>
  );
}

export function VenueCard({ booking, venue }: { booking: BookingView; venue: PublicRestaurant | null }) {
  const { t } = useT();
  const cover = venue?.photos.find((p) => p.is_cover) ?? venue?.photos[0];
  return (
    <aside className="rb-card rb5-venue" aria-label={t("Restaurant")}>
      {cover && <img className="rb5-venue-photo" src={cover.url} alt={cover.alt || ""} />}
      <div className="rb5-venue-body">
        <p className="rb5-eyebrow">{t("Restaurant")}</p>
        <h2 className="rb5-venue-name">{booking.venue_name}</h2>
        {venue?.address && <p className="rb-muted">{venue.address}</p>}
      </div>
    </aside>
  );
}
