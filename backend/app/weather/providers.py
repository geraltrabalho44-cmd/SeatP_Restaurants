import math
from datetime import UTC, datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

import httpx


class WeatherUnavailable(Exception):
    pass


class WeatherProvider(Protocol):
    def fetch(self, lat: float, lng: float, now: datetime, zone: str) -> list[dict]: ...


def condition(hour):
    if hour["probability"] >= 60 or hour["mm"] >= 0.5:
        return "Rain expected"
    if hour["probability"] >= 30:
        return "Showers possible"
    if hour["cloud"] >= 75:
        return "Cloudy"
    return "Sun and clouds" if hour["cloud"] >= 30 else "Sunny"


class DemoWeather:
    def __init__(self, scenario):
        self.scenario = scenario

    def fetch(self, lat, lng, now, zone):
        local_now = now.astimezone(ZoneInfo(zone))
        first = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
        hours = []
        for i in range(168):
            stamp = first + timedelta(hours=i)
            local = stamp.astimezone(ZoneInfo(zone))
            wet = (
                self.scenario == "rain-evening"
                and 19 <= local.hour <= 23
                and local.date() == local_now.date() + timedelta(days=1)
            )
            showers = self.scenario == "showers"
            hours.append(
                {
                    "stamp": int(stamp.timestamp()),
                    "temperature": round(17 + 4 * math.cos((local.hour - 14) * math.pi / 12)),
                    "probability": 80 if wet else 45 if showers else 5,
                    "mm": 1 if wet else 0,
                    "cloud": 90 if wet or self.scenario == "overcast" else 40 if showers else 12,
                    "wind": 12,
                }
            )
        return hours


class OpenMeteo:
    def __init__(self, key):
        self.key = key

    def fetch(self, lat, lng, now, zone):
        host = "customer-api.open-meteo.com" if self.key else "api.open-meteo.com"
        fields = [
            "temperature_2m",
            "precipitation_probability",
            "precipitation",
            "cloud_cover",
            "wind_speed_10m",
        ]
        params = {
            "latitude": lat,
            "longitude": lng,
            "hourly": ",".join(fields),
            "timezone": "GMT",
            "forecast_days": 7,
            "timeformat": "unixtime",
        }
        if self.key:
            params["apikey"] = self.key
        try:
            response = httpx.get("https://" + host + "/v1/forecast", params=params, timeout=2.5)
            response.raise_for_status()
            hourly = response.json()["hourly"]
            rows = []
            for stamp, temp, prob, mm, cloud, wind in zip(
                hourly["time"], *(hourly[f] for f in fields), strict=True
            ):
                if all(
                    isinstance(n, (float, int)) and math.isfinite(n)
                    for n in (stamp, temp, prob, mm, cloud, wind)
                ):
                    rows.append(
                        {
                            "stamp": int(stamp),
                            "temperature": round(temp),
                            "probability": prob,
                            "mm": mm,
                            "cloud": cloud,
                            "wind": wind,
                        }
                    )
            if not rows:
                raise ValueError()
            return rows
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            raise WeatherUnavailable() from None
