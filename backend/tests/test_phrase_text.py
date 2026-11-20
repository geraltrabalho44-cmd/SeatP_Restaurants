"""Every sentence the server writes about a table can be put in the language of a booking email."""

import pytest

from app.ambience import phrases
from app.mail.phrase_text import translate


def _all_server_sentences() -> list[str]:
    fixed = [
        *phrases.LIGHT_ONLY.values(),
        *phrases.NEAR_WORDS.values(),
        *phrases.TAG_WORDS.values(),
    ]
    fixed += [phrases.QUIET, "Direct sun for your whole meal", "Under the stars"]
    fixed += ["Facing the window", "Back to the window", "Side-on to the window"]
    fixed += [
        "Direct sun until 14:30",
        "Sun reaches this table at 12:15",
        "Sunset at 20:05 from your seat",
    ]
    fixed += ["It gets dark at 21:40", "View of the Tagus river"]
    return fixed


@pytest.mark.parametrize("locale", ["pt", "es", "fr"])
def test_every_sentence_the_server_writes_has_a_translation(locale: str) -> None:
    for sentence in _all_server_sentences():
        words = translate(sentence, locale)
        assert words and words != sentence, (locale, sentence)
        assert "{" not in words, (locale, words)


def test_the_time_and_the_restaurants_own_words_are_kept() -> None:
    assert translate("Direct sun until 14:30", "pt") == "Sol direto até às 14:30"
    assert (
        translate("Sunset at 20:05 from your seat", "fr")
        == "Coucher de soleil à 20:05 depuis votre place"
    )
    assert translate("View of the Tagus river", "es") == "Vista: Tagus river"


def test_english_stays_and_an_unknown_sentence_is_left_out() -> None:
    assert translate("Direct sun until 14:30", "en") == "Direct sun until 14:30"
    assert translate("Direct sun until 14:30", None) == "Direct sun until 14:30"
    assert translate("A sentence nobody wrote", "pt") is None
