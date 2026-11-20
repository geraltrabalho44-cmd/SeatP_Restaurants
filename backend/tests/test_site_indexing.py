"""The demo site asks search engines not to list it (it shows invented reviews of real restaurants)."""

from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


def test_robots_txt_keeps_crawlers_out() -> None:
    lines = (FRONTEND / "public" / "robots.txt").read_text().splitlines()
    assert "User-agent: *" in lines and "Disallow: /" in lines


def test_the_page_says_noindex_and_has_share_tags() -> None:
    page = (FRONTEND / "index.html").read_text()
    assert '<meta name="robots" content="noindex, nofollow" />' in page
    for tag in ("og:title", "og:description", "og:type", "og:site_name"):
        assert f'property="{tag}"' in page
