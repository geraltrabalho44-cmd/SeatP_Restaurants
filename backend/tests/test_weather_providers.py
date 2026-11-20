"""The forecast provider, the weather answer a diner gets, and the rain plan's owner switch."""

import math

import httpx
import pytest
from conftest import auth_header, make_user
from test_restaurant_helpers import future_day, make_restaurant

from app.config import load_settings
from app.models import Venue
from app.weather import providers
from app.weather.providers import OpenMeteo, WeatherUnavailable, condition


@pytest.mark.parametrize(
    ("hour", "expected"),
    [
        ({"probability": 5, "mm": 0, "cloud": 10}, "Sunny"),
        ({"probability": 5, "mm": 0, "cloud": 40}, "Sun and clouds"),
        ({"probability": 5, "mm": 0, "cloud": 80}, "Cloudy"),
        ({"probability": 30, "mm": 0, "cloud": 10}, "Showers possible"),
        ({"probability": 60, "mm": 0, "cloud": 10}, "Rain expected"),
        ({"probability": 0, "mm": 0.5, "cloud": 10}, "Rain expected"),
    ],
)
def test_the_words_for_the_weather(hour, expected):
    assert condition(hour) == expected


def _answer(hourly, status=200):
    def get(url, params=None, timeout=None):
        get.seen = (url, params)
        return httpx.Response(status, json={"hourly": hourly}, request=httpx.Request("GET", url))

    return get


def _hourly(n=3, **over):
    data = {
        "time": [1_800_000_000 + 3600 * i for i in range(n)],
        "temperature_2m": [17.4] * n,
        "precipitation_probability": [10] * n,
        "precipitation": [0.0] * n,
        "cloud_cover": [20] * n,
        "wind_speed_10m": [11.0] * n,
    }
    data.update(over)
    return data


def test_open_meteo_is_read_into_hours(monkeypatch):
    get = _answer(_hourly())
    monkeypatch.setattr(providers.httpx, "get", get)
    hours = OpenMeteo("").fetch(38.72, -9.14, None, "Europe/Lisbon")
    assert hours[0] == {
        "stamp": 1_800_000_000, "temperature": 17, "probability": 10, "mm": 0.0, "cloud": 20, "wind": 11.0,
    }  # fmt: skip
    url, params = get.seen
    assert url == "https://api.open-meteo.com/v1/forecast"  # the free host: no key, no account
    assert params["forecast_days"] == 7 and params["latitude"] == 38.72 and "apikey" not in params


def test_a_key_switches_to_the_customer_host_and_never_shows_in_an_error(monkeypatch):
    get = _answer(_hourly())
    monkeypatch.setattr(providers.httpx, "get", get)
    OpenMeteo("sekrit-key").fetch(38.72, -9.14, None, "Europe/Lisbon")
    assert get.seen[0].startswith("https://customer-api.open-meteo.com/")
    assert get.seen[1]["apikey"] == "sekrit-key"
    monkeypatch.setattr(providers.httpx, "get", _answer({}, status=500))
    with pytest.raises(WeatherUnavailable) as error:
        OpenMeteo("sekrit-key").fetch(38.72, -9.14, None, "Europe/Lisbon")
    assert "sekrit-key" not in repr(error.value) and "sekrit-key" not in str(error.value)


@pytest.mark.parametrize(
    "answer",
    [
        _answer({}),  # no hourly data at all
        _answer(_hourly(0)),  # an empty forecast is no forecast
        _answer(_hourly(temperature_2m=[17.4])),  # arrays of different lengths
        _answer(_hourly(precipitation=[None] * 3)),  # nothing usable
        _answer(_hourly(cloud_cover=[math.nan] * 3)),
        _answer(_hourly(), status=503),
    ],
)
def test_a_bad_answer_is_unavailable_not_a_crash(monkeypatch, answer):
    monkeypatch.setattr(providers.httpx, "get", answer)
    with pytest.raises(WeatherUnavailable):
        OpenMeteo("").fetch(38.72, -9.14, None, "Europe/Lisbon")


def test_a_network_failure_is_unavailable(monkeypatch):
    def down(url, params=None, timeout=None):
        raise httpx.ConnectTimeout("slow", request=httpx.Request("GET", url))

    monkeypatch.setattr(providers.httpx, "get", down)
    with pytest.raises(WeatherUnavailable):
        OpenMeteo("").fetch(38.72, -9.14, None, "Europe/Lisbon")


def test_a_half_set_weather_provider_is_refused_at_start(monkeypatch):
    monkeypatch.setenv("WEATHER_PROVIDER", "carrier-pigeon")
    with pytest.raises(RuntimeError):
        load_settings()


def _located(session, organiser):
    place = make_restaurant(session, organiser)
    venue = session.get(Venue, place.venue_id)
    venue.lat, venue.lng = 38.7223, -9.1393
    session.commit()
    return place


def test_a_restaurant_without_a_location_gives_no_forecast(client, session, organiser):
    place = make_restaurant(session, organiser)
    answer = client.get(
        f"/api/r/{place.public_id}/weather", params={"day": future_day(1).isoformat()}
    )
    assert answer.status_code == 200 and answer.json() == {"located": False}


def test_the_forecast_a_diner_sees_comes_from_the_demo_provider_by_default(
    client, session, organiser
):
    place = _located(session, organiser)
    day = future_day(2).isoformat()
    first = client.get(f"/api/r/{place.public_id}/weather", params={"day": day, "party": 2})
    assert first.status_code == 200, first.text
    data = first.json()
    assert data["located"] and data["source"] == "demo" and data["status"] == "fresh"
    assert len(data["hours"]) == 24 and data["sunset"]
    assert {"time", "temperature", "condition"} <= set(data["hours"][0])
    # A second request is answered from the cache.
    assert (
        client.get(f"/api/r/{place.public_id}/weather", params={"day": day}).json()["hours"]
        == data["hours"]
    )


def test_beyond_a_week_there_is_no_forecast_but_the_sunset_is_still_known(
    client, session, organiser
):
    place = _located(session, organiser)
    far = future_day(30).isoformat()
    data = client.get(f"/api/r/{place.public_id}/weather", params={"day": far}).json()
    assert data["hours"] == [] and data["status"] == "later" and data["sunset"]


def test_a_forecast_is_a_read_that_is_rate_limited_and_validated(client, session, organiser):
    place = _located(session, organiser)
    url = f"/api/r/{place.public_id}/weather"
    assert client.get(url, params={"day": "not-a-date"}).status_code == 422
    assert client.get(url, params={"day": future_day(1).isoformat(), "party": 0}).status_code == 422
    assert (
        client.get("/api/r/nope/weather", params={"day": future_day(1).isoformat()}).status_code
        == 404
    )


def test_the_forecast_shares_the_read_limit_of_the_restaurant_pages(client, session, organiser):
    # The forecast counts in the same r-read counter as the other reads of a restaurant, so it must not run out sooner:
    # a diner who has read 130 times in a minute (a class on one wifi) still gets the weather on the booking page.
    place = _located(session, organiser)
    url = f"/api/r/{place.public_id}/weather"
    params = {"day": future_day(1).isoformat()}
    statuses = {client.get(url, params=params).status_code for _ in range(130)}
    assert statuses == {200}


def test_only_the_owner_turns_the_rain_plan_on(client, session, organiser):
    place = make_restaurant(session, organiser)
    url = f"/api/owner/restaurants/{place.public_id}/rain-plan"
    assert client.put(url, json={"enabled": True}).status_code == 401
    assert client.put(url, json={"enabled": True}, headers=auth_header(organiser)).json() == {
        "enabled": True
    }
    stranger = make_user(session, "stranger.owner@example.com")
    session.commit()
    assert client.put(url, json={"enabled": True}, headers=auth_header(stranger)).status_code == 404
    assert (
        client.put(url, json={"enabled": "yes please"}, headers=auth_header(organiser)).status_code
        == 422
    )


def test_the_rain_cron_needs_the_secret(client):
    assert client.post("/api/internal/weather/process").status_code == 401
    assert (
        client.post("/api/internal/weather/process", headers={"X-Cron-Secret": "wrong"}).status_code
        == 401
    )


def test_a_rain_link_that_does_not_exist_is_a_plain_404(client):
    assert client.get("/api/rain/not-a-token").status_code == 404
    assert client.post("/api/rain/not-a-token/accept").status_code == 404
    assert client.get("/api/b/not-a-token/rain").status_code == 404


def test_nothing_is_offered_to_a_restaurant_that_never_opted_in(session, organiser):
    from app.restaurant_service import rain_plan

    make_restaurant(session, organiser)
    assert rain_plan.process(session) == 0
