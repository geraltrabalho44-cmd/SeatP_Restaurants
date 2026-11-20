"""vercel.json keeps the API next to the database."""

import json
from pathlib import Path

VERCEL = json.loads((Path(__file__).resolve().parents[2] / "vercel.json").read_text())


def test_the_api_runs_in_london_next_to_the_database() -> None:
    # The Neon database is in AWS eu-west-2 (London). Vercel's functions default to Washington (iad1), which put an
    # Atlantic crossing under every database query: the restaurant list took 1.9 s there against 0.02 s locally.
    # If the database moves, move this with it.
    assert VERCEL["regions"] == ["lhr1"]
