from datetime import UTC, datetime

from app.weather.providers import DemoWeather, condition


def test_demo_evening_forecast():
    now = datetime(2026, 11, 18, 0, tzinfo=UTC)
    rows = DemoWeather("rain-evening").fetch(38.72, -9.14, now, "Europe/Lisbon")
    assert len(rows) == 168
    assert condition(rows[43]) == "Rain expected"
    assert condition(dict(rows[0], probability=60)) == "Rain expected"


def test_forecast_refresh_failure_reuses_cache_and_backs_off(session, monkeypatch):
    from types import SimpleNamespace

    from app.restaurant_service import weather_view
    from app.weather.providers import WeatherUnavailable

    now = datetime(2026, 11, 18, 12, tzinfo=UTC)
    venue = SimpleNamespace(lat=38.72, lng=-9.14, timezone="Europe/Lisbon")
    calls = []

    def fetch(self, lat, lng, when, zone):
        calls.append(when)
        if len(calls) > 1:
            raise WeatherUnavailable()
        return DemoWeather("clear").fetch(lat, lng, when, zone)

    monkeypatch.setattr(
        weather_view,
        "get_settings",
        lambda: SimpleNamespace(
            weather_provider="open-meteo",
            weather_demo_scenario="clear",
            open_meteo_api_key="",
            weather_max_fetches_per_hour=8,
        ),
    )
    monkeypatch.setattr(weather_view.OpenMeteo, "fetch", fetch)
    from datetime import timedelta

    for lag, expected in [
        (0, "fresh"),
        (1, "fresh"),
        (3, "stale"),
        (3.01, "stale"),
        (13, "unavailable"),
    ]:
        _, state = weather_view.hourly(
            session, venue, now.date() + timedelta(days=1), now + timedelta(hours=lag)
        )
        assert state == expected
    assert len(calls) == 3
