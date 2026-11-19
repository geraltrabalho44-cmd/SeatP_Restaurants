from datetime import date, time

import pytest

from app.restaurant_service.search_query import RuleSearch

TODAY = date(2026, 11, 18)  # a Wednesday


def test_weekday_river_and_party():
    intent = RuleSearch().parse("sushi for 4 near the river on Saturday", date(2026, 11, 18))
    assert intent.cuisines == ["sushi"] and intent.party == 4 and intent.day == date(2026, 11, 21)
    assert intent.river and not intent.text


def test_portuguese_budget_time_and_typo():
    intent = RuleSearch().parse("esplanda para 2 amanhã às 19h30 até 30€", date(2026, 11, 18))
    assert intent.features == ["terrace"] and intent.prices == [1, 2]
    assert str(intent.at) == "19:30:00" and not intent.text


def test_distance_and_budget_are_independent():
    intent = RuleSearch().parse("até 2 km em Lisboa até 30€", date(2026, 11, 18))
    assert intent.within == 2000 and intent.prices == [1, 2] and not intent.text


# One phrase per row: (phrase, party, day, time, cuisines, features, left over). Four languages,
# digits and number words, typos, and the way people really type a search.
PHRASES = [
    ("sushi for four near the river on Saturday", 4, date(2026, 11, 21), None, ["sushi"], [], ""),
    (
        "una mesa para dos mañana terraza tranquila",
        2,
        date(2026, 11, 19),
        None,
        [],
        ["terrace"],
        "",
    ),
    ("table pour deux demain soir terrasse", 2, date(2026, 11, 19), time(20), [], ["terrace"], ""),
    ("2 people tonight", 2, None, time(20), [], [], ""),
    ("mesa para casal amanha marisco", 2, date(2026, 11, 19), None, ["seafood"], [], ""),
    ("a couple lunch today", 2, TODAY, time(13), [], [], ""),
    ("dinner for 6 sunday vegetarian", 6, date(2026, 11, 22), time(20), ["vegetarian"], [], ""),
    ("ramen para 3 pessoas", 3, None, None, ["japanese"], [], ""),
    ("jantar hoy en terraza", None, TODAY, time(20), [], ["terrace"], ""),
    ("pizzeria", None, None, None, ["pizza"], [], ""),
    ("table for 12 on friday at 19:30", 12, date(2026, 11, 20), time(19, 30), [], [], ""),
    ("pastel de nata", None, None, None, [], [], "pastel de nata"),
]


@pytest.mark.parametrize(("phrase", "party", "day", "at", "cuisines", "features", "text"), PHRASES)
def test_phrases_in_four_languages(phrase, party, day, at, cuisines, features, text):
    intent = RuleSearch().parse(phrase, TODAY)
    assert (intent.party, intent.day, intent.at) == (party, day, at), phrase
    assert intent.cuisines == cuisines and intent.features == features, phrase
    assert intent.text == text, phrase


def test_a_distance_is_not_mistaken_for_a_party():
    intent = RuleSearch().parse("sushi a 2 km de Chiado", TODAY)
    assert intent.party is None and intent.within == 2000 and intent.cuisines == ["sushi"]


def test_quiet_and_budget_words():
    intent = RuleSearch().parse("cheap quiet italian", TODAY)
    assert intent.quiet and intent.prices == [1] and intent.cuisines == ["italian"]
    assert RuleSearch().parse("barato e tranquilo", TODAY).quiet
    assert RuleSearch().parse("calme", TODAY).quiet


def test_what_is_not_understood_stays_in_the_text_search():
    intent = RuleSearch().parse("Tasca do Bairro sushi", TODAY)
    assert intent.cuisines == ["sushi"] and "tasca" in intent.text and "bairro" in intent.text
    # Nothing recognised at all: the whole phrase is kept, so a restaurant's name still finds it.
    assert RuleSearch().parse("Casa Lumen", TODAY).text == "Casa Lumen"


def test_long_or_odd_input_is_bounded_and_never_raises():
    parser = RuleSearch()
    assert parser.parse("x" * 5000, TODAY).text
    for odd in ("", "   ", "€€€", "for 99", "para 0 pessoas", "até km", "!!!???"):
        parser.parse(odd, TODAY)
    # A party of more than 12 is not read as a party: tables for big groups call the restaurant.
    assert parser.parse("table for 40", TODAY).party is None


def test_every_chip_comes_from_the_phrase():
    intent = RuleSearch().parse("sushi for 4 on Saturday", TODAY)
    assert intent.chips
    assert all(chip.strip() in "sushi for 4 on saturday" for chip in intent.chips)
