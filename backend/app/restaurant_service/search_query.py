"""Bounded, offline EN/PT restaurant query interpretation. Raw queries are never stored."""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, time, timedelta
from difflib import get_close_matches
from typing import Protocol

from app.restaurant_service.profiles import CUISINES


@dataclass
class Intent:
    text: str = ""
    cuisines: list[str] = field(default_factory=list)
    features: list[str] = field(default_factory=list)
    prices: list[int] = field(default_factory=list)
    party: int | None = None
    day: date | None = None
    at: time | None = None
    place: tuple[float, float] | None = None
    within: int | None = None
    quiet: bool = False
    river: bool = False
    chips: list[str] = field(default_factory=list)


class SearchProvider(Protocol):
    def parse(self, text: str, today: date) -> Intent: ...


WORDS = {
    "terrace": "terrace",
    "esplanada": "terrace",
    "outdoor": "terrace",
    "patio": "terrace",
    "terraco": "terrace",
    "sol": "sun",
    "sunny": "sun",
    "sun": "sun",
    "vista": "view",
    "view": "view",
    "wheelchair": "accessible",
    "acessivel": "accessible",
    "accessible": "accessible",
    "quiet": "quiet",
    "sossegada": "quiet",
    "tranquila": "quiet",
    "marisco": "seafood",
    "marisqueira": "seafood",
    "japones": "japanese",
    "ramen": "japanese",
    "peixe": "fish",
    "italiano": "italian",
    "portuguesa": "portuguese",
    "portugues": "portuguese",
    "tapas": "petiscos",
    "mariscos": "seafood",
    "pescado": "fish",
    "poisson": "fish",
    "terraza": "terrace",
    "terrasse": "terrace",
    "exterieur": "terrace",
    "exterior": "terrace",
    "tranquilo": "quiet",
    "calme": "quiet",
    "silencioso": "quiet",
    "vue": "view",
    "soleado": "sun",
    "ensoleille": "sun",
    "soleil": "sun",
    "accesible": "accessible",
    "pizzaria": "pizza",
    "pizzeria": "pizza",
    "japonais": "japanese",
    "italien": "italian",
    "italiana": "italian",
    "vegetariana": "vegetarian",
    "vegetarien": "vegetarian",
    "vegetalien": "vegan",
    "vegetariano": "vegetarian",
    "vegano": "vegan",
    **{c: c for c in CUISINES},
}
PLACES = {
    "lisboa": (38.7223, -9.1393),
    "lisbon": (38.7223, -9.1393),
    "porto": (41.1579, -8.6291),
    "chiado": (38.7107, -9.1425),
    "alfama": (38.7117, -9.1302),
    "belem": (38.6979, -9.2067),
    "bairro alto": (38.7132, -9.1443),
    "cascais": (38.6979, -9.4215),
}
DAYS = [
    ("monday", "segunda", "lunes", "lundi"),
    ("tuesday", "terca", "martes", "mardi"),
    ("wednesday", "quarta", "miercoles", "mercredi"),
    ("thursday", "quinta", "jueves", "jeudi"),
    ("friday", "sexta", "viernes", "vendredi"),
    ("saturday", "sabado", "sabado", "samedi"),
    ("sunday", "domingo", "domingo", "dimanche"),
]
STOP = {
    "a",
    "an",
    "the",
    "for",
    "on",
    "with",
    "at",
    "in",
    "of",
    "by",
    "from",
    "me",
    "my",
    "table",
    "tables",
    "restaurant",
    "restaurants",
    "near",
    "to",
    "and",
    "para",
    "em",
    "com",
    "de",
    "do",
    "da",
    "no",
    "na",
    "o",
    "as",
    "mesa",
    "mesas",
    "restaurante",
    "restaurantes",
    "junto",
    "ao",
    "por",
    "perto",
    "pessoas",
    "people",
    "una",
    "un",
    "el",
    "la",
    "los",
    "las",
    "del",
    "en",
    "con",
    "personas",
    "personnes",
    "une",
    "des",
    "pour",
    "le",
    "les",
    "avec",
    "au",
    "aux",
    "du",
    "et",
    "y",
}

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
    "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10, "uno": 1, "dos": 2,
    "cuatro": 4, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "deux": 2, "trois": 3,
    "quatre": 4, "cinq": 5, "sept": 7, "huit": 8, "neuf": 9, "dix": 10,
}  # fmt: skip
NUMBER_PATTERN = "|".join(sorted(NUMBER_WORDS, key=len, reverse=True))


def plain(text):
    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c)
    )


class RuleSearch:
    def parse(self, text, today):
        remaining = plain(text[:140])
        intent = Intent()

        def take(pattern):
            nonlocal remaining
            match = re.search(pattern, remaining)
            if match:
                intent.chips.append(match[0].strip())
                remaining = remaining[: match.start()] + " " + remaining[match.end() :]
            return match

        if m := take(r"\b(?:for|para|pour)\s+([1-9]|1[0-2])\b"):
            intent.party = int(m[1])
        elif m := take(r"\b(?:for|para|pour)\s+(" + NUMBER_PATTERN + r")\b"):
            intent.party = NUMBER_WORDS[m[1]]
        elif m := take(
            r"\b([1-9]|1[0-2]|"
            + NUMBER_PATTERN
            + r")\s*(?:people|persons?|guests?|pax|pessoas|personas|personnes)\b"
        ):
            intent.party = int(m[1]) if m[1].isdigit() else NUMBER_WORDS[m[1]]
        elif take(r"\b(?:a couple|couple|casal|pareja|en couple|a dois)\b"):
            intent.party = 2
        if m := take(
            r"\b(?:within|ate|num raio de)?\s*(\d{1,2}(?:[.,]\d)?)\s*(km|kilometres|quilometros)\b"
        ):
            intent.within = round(float(m[1].replace(",", ".")) * 1000)
        if m := take(
            r"\b(?:up to|under|below|ate|menos de|max)\s*€?\s*(\d{1,3})(?:\s*(?:euros?|€))?"
        ):
            intent.prices = [i for i, low in enumerate((0, 15, 30, 60), 1) if low < int(m[1])] or [
                1
            ]
        elif take(r"\b(?:cheap|barato|barata|budget|economico|economica|pas cher)\b"):
            intent.prices = [1]
        if m := take(r"\b(?:at |as )?([01]?\d|2[0-3])(?:h([0-5]\d)?|:([0-5]\d))\b"):
            intent.at = time(int(m[1]), int(m[2] or m[3] or 0))
        elif take(r"\b(?:tonight|dinner|jantar|a noite|esta noche|cena|ce soir|soir|diner)\b"):
            intent.at = time(20)
        elif take(r"\b(?:lunch|almoco|almuerzo|comida|dejeuner)\b"):
            intent.at = time(13)
        if take(
            r"\b(?:day after tomorrow|depois de amanha|pasado manana|apres-demain|apres demain)\b"
        ):
            intent.day = today + timedelta(days=2)
        elif take(r"\b(?:tomorrow|amanha|manana|demain)\b"):
            intent.day = today + timedelta(days=1)
        elif take(r"\b(?:today|hoje|hoy|aujourd'hui|aujourd hui)\b"):
            intent.day = today
        else:
            for i, names in enumerate(DAYS):
                match = take(r"\b(next |proxim[oa] )?(?:" + "|".join(names) + r")(?:-feira)?\b")
                if match:
                    days = (i - today.weekday()) % 7
                    intent.day = today + timedelta(days=days or (7 if match[1] else 0))
                    break
        for name, coords in PLACES.items():
            if take(r"\b" + name + r"\b"):
                intent.place = coords
                intent.within = intent.within or (
                    2000 if name in ("chiado", "alfama", "belem", "bairro alto") else 15000
                )
                break
        if take(
            r"\b(?:(?:near|by) the river|river view|vista (?:para o |de |al |sobre el )?rio|junto ao rio|junto al rio|au bord de la riviere|vue sur le fleuve)\b"
        ):
            intent.river = True
        leftover = []
        for token in remaining.split():
            word = token.strip(".,!?")
            meaning = WORDS.get(word)
            if not meaning and len(word) >= 5:
                nearby = get_close_matches(word, WORDS, n=1, cutoff=0.84)
                meaning = WORDS[nearby[0]] if nearby else None
            if meaning:
                intent.chips.append(token)
                if meaning == "quiet":
                    intent.quiet = True
                else:
                    values = intent.cuisines if meaning in CUISINES else intent.features
                    if meaning not in values:
                        values.append(meaning)
            elif word not in STOP:
                leftover.append(word)
        intent.text = " ".join(leftover) if intent.chips else text.strip()
        return intent
