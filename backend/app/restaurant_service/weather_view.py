"""Restaurant-local forecasts and table suggestions for a real seating window."""

from datetime import UTC, datetime, time, timedelta

from sqlalchemy import update

from app import db
from app.ambience.light import LIGHT_WINDOWS, opening_distance, opening_facing
from app.ambience.solar import sun_position, sun_times
from app.config import get_settings
from app.core.errors import ApiError
from app.models import WeatherCache, utc_now
from app.restaurant_service import ambience_view, occupancy, schedule
from app.restaurant_service.availability import slot_statuses
from app.restaurant_service.clock import local_datetime, venue_zone
from app.restaurant_service.map_view import fit_problem
from app.security import rate_limit
from app.weather.providers import (
    DemoWeather,
    OpenMeteo,
    WeatherProvider,
    WeatherUnavailable,
    condition,
)


def hourly(session, venue, day, now):
    settings = get_settings()
    zone = venue_zone(venue)
    today = now.astimezone(zone).date()
    if not today <= day < today + timedelta(days=7):
        return [], "later"
    lat, lng = round(venue.lat, 2), round(venue.lng, 2)
    demo = settings.weather_provider == "demo"
    key = (
        f"{settings.weather_provider}:{settings.weather_demo_scenario}:{venue.timezone}:{lat}:{lng}"
    )
    row = session.get(WeatherCache, key)
    state = "fresh"
    if row and now - row.refreshed < timedelta(hours=2):
        hours = row.hours
    else:
        # Commit the lease before calling a provider so no database lock spans HTTP.
        if row is None:
            db.insert_ignoring_duplicates(
                session,
                WeatherCache,
                {"cell": key, "refreshed": now - timedelta(days=8), "hours": []},
            )
        lease = now + timedelta(seconds=20)
        claim = session.execute(
            update(WeatherCache)
            .where(
                WeatherCache.cell == key,
                WeatherCache.refreshed <= now - timedelta(hours=2),
                WeatherCache.refresh_lease_until.is_(None)
                | (WeatherCache.refresh_lease_until <= now),
            )
            .values(refresh_lease_until=lease)
        )
        session.commit()
        hours = []
        if claim.rowcount:
            provider: WeatherProvider = (
                DemoWeather(settings.weather_demo_scenario)
                if demo
                else OpenMeteo(settings.open_meteo_api_key)
            )
            try:
                if not demo:
                    rate_limit(
                        session, "weather-fetch:global", settings.weather_max_fetches_per_hour, 3600
                    )
                hours = provider.fetch(lat, lng, now, venue.timezone)
            except (WeatherUnavailable, ApiError):
                session.execute(
                    update(WeatherCache)
                    .where(WeatherCache.cell == key, WeatherCache.refresh_lease_until == lease)
                    .values(refresh_lease_until=now + timedelta(minutes=5))
                )
            else:
                session.execute(
                    update(WeatherCache)
                    .where(WeatherCache.cell == key, WeatherCache.refresh_lease_until == lease)
                    .values(hours=hours, refreshed=now, refresh_lease_until=None)
                )
            session.commit()
        if not hours:
            row = session.get(WeatherCache, key, populate_existing=True)
            if not row.hours or now - row.refreshed > timedelta(hours=12):
                return [], "unavailable"
            hours = row.hours
            state = "fresh" if now - row.refreshed < timedelta(hours=2) else "stale"
    result = []
    for hour in hours:
        local = datetime.fromtimestamp(hour["stamp"], UTC).astimezone(zone)
        if local.date() == day:
            result.append({**hour, "time": local.strftime("%H:%M"), "condition": condition(hour)})
    return result, state if result else "unavailable"


def sunset_rank(room, table, azimuth):
    if room.is_outdoor:
        return (0, 0)
    best = None
    for opening in room.openings:
        if opening.kind not in LIGHT_WINDOWS:
            continue
        facing = opening_facing(room, opening)
        if facing is None:
            continue
        distance = opening_distance(room, table, opening)
        angle = abs((facing - azimuth + 180) % 360 - 180)
        if angle <= 50 and distance < 300:
            score = (angle, distance)
            if best is None or score < best:
                best = score
    return best


def view(session, venue, day, at, needs):
    if venue.lat is None or venue.lng is None:
        return {"located": False}
    now = utc_now()
    hours, status = hourly(session, venue, day, now)
    sunset = sun_times(venue.lat, venue.lng, day, venue_zone(venue)).sunset
    azimuth = sun_position(venue.lat, venue.lng, sunset).azimuth_deg if sunset else None
    minutes = schedule.turn_minutes(session, venue, needs.size)
    slots = slot_statuses(session, venue, day, needs)
    busy = occupancy.merge(
        occupancy.booked_slots(session, venue, day), occupancy.held_slots(session, venue, day)
    )
    zones = occupancy.zone_kinds(session, venue)
    indoor = []
    sunset_tables = []
    for loaded in ambience_view.load_rooms(session, venue):
        for row, table in loaded.tables:
            if fit_problem(row, needs):
                continue
            item = {"id": row.id, "label": row.label, "room": loaded.name}
            if not loaded.room.is_outdoor and zones.get(row.zone_id) != "terrace":
                indoor.append((row.max_party - needs.size, item))
            rank = sunset_rank(loaded.room, table, azimuth) if azimuth is not None else None
            if rank is not None:
                sunset_tables.append((rank, item))
    choices = []
    indoor_free = []
    for slot in slots:
        if slot["status"] == "full":
            continue
        start = time.fromisoformat(slot["time"])
        window = schedule.window_for(start, minutes)
        if start == at:
            indoor_free = [
                item
                for _, item in sorted(indoor, key=lambda p: (p[0], p[1]["id"]))
                if occupancy.is_free((item["id"],), busy, window)
            ]
        moment = local_datetime(venue, day, start)
        if sunset and moment <= sunset < moment + timedelta(minutes=minutes):
            tables = [
                item
                for _, item in sorted(sunset_tables, key=lambda p: (p[0], p[1]["id"]))
                if occupancy.is_free((item["id"],), busy, window)
            ]
            if tables:
                choices.append(
                    {
                        "time": slot["time"],
                        "tables": tables,
                        "minutes_to_sunset": round((sunset - moment).total_seconds() / 60),
                    }
                )
    choices.sort(key=lambda c: abs(c["minutes_to_sunset"] - 45))
    return {
        "located": True,
        "source": get_settings().weather_provider,
        "status": status,
        "hours": hours,
        "sunset": sunset.strftime("%H:%M") if sunset else None,
        "sunset_choices": choices,
        "indoor": indoor_free[:3],
    }
