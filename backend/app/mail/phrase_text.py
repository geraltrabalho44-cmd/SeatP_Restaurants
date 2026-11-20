"""The short sentences about a table (light, view, what is close by, the chair), in the language of a booking email.

The server writes these in English (ambience/phrases.py) and the site translates them on screen (serverText.ts). An email is
written on the server, so it needs the same translations here. They come from a closed set; `translate` returns None for a
sentence it does not know, and the email then leaves it out instead of mixing languages. "View of the X" carries the
restaurant's own words (X) and keeps them as written.

If you change a sentence in ambience/phrases.py, change it here and in the site's catalogue too.
"""

import re

# English sentence -> (Portuguese, Spanish, French). A "{time}" stands for a time such as 14:30.
_SENTENCES: dict[str, tuple[str, str, str]] = {
    "Evening: it will be dark outside": (
        "À noite: vai estar escuro lá fora",
        "Por la noche: estará oscuro fuera",
        "Le soir : il fera nuit dehors",
    ),
    "Bright, by a window": (
        "Luminosa, junto a uma janela",
        "Luminosa, junto a una ventana",
        "Lumineuse, près d'une fenêtre",
    ),
    "In the shade": (
        "À sombra",
        "A la sombra",
        "À l'ombre",
    ),
    "Next to the bar": (
        "Junto ao bar",
        "Junto a la barra",
        "À côté du bar",
    ),
    "Near the toilets": (
        "Perto das casas de banho",
        "Cerca de los aseos",
        "Près des toilettes",
    ),
    "By the open kitchen": (
        "Junto à cozinha aberta",
        "Junto a la cocina abierta",
        "Près de la cuisine ouverte",
    ),
    "By the fireplace": (
        "Junto à lareira",
        "Junto a la chimenea",
        "Près de la cheminée",
    ),
    "Close to the live music": (
        "Perto da música ao vivo",
        "Cerca de la música en directo",
        "Près de la musique live",
    ),
    "Near the TV": (
        "Perto da televisão",
        "Cerca de la tele",
        "Près de la télévision",
    ),
    "Near the host stand": (
        "Perto do balcão de receção",
        "Cerca del puesto de recepción",
        "Près du pupitre d'accueil",
    ),
    "Near the entrance": (
        "Perto da entrada",
        "Cerca de la entrada",
        "Près de l'entrée",
    ),
    "River view": (
        "Vista para o rio",
        "Vista al río",
        "Vue sur le fleuve",
    ),
    "Sea view": (
        "Vista para o mar",
        "Vista al mar",
        "Vue sur la mer",
    ),
    "Street view": (
        "Vista para a rua",
        "Vista a la calle",
        "Vue sur la rue",
    ),
    "Garden view": (
        "Vista para o jardim",
        "Vista al jardín",
        "Vue sur le jardin",
    ),
    "Courtyard view": (
        "Vista para o pátio",
        "Vista al patio",
        "Vue sur la cour",
    ),
    "Monument view": (
        "Vista para o monumento",
        "Vista al monumento",
        "Vue sur le monument",
    ),
    "City view": (
        "Vista para a cidade",
        "Vista a la ciudad",
        "Vue sur la ville",
    ),
    "View of the hills": (
        "Vista para as colinas",
        "Vista a las colinas",
        "Vue sur les collines",
    ),
    "Pool view": (
        "Vista para a piscina",
        "Vista a la piscina",
        "Vue sur la piscine",
    ),
    "View of the square": (
        "Vista para a praça",
        "Vista a la plaza",
        "Vue sur la place",
    ),
    "View of the {place}": (
        "Vista: {place}",
        "Vista: {place}",
        "Vue : {place}",
    ),
    "In a quiet corner": (
        "Num canto sossegado",
        "En un rincón tranquilo",
        "Dans un coin tranquille",
    ),
    "Direct sun for your whole meal": (
        "Sol direto durante toda a refeição",
        "Sol directo durante toda la comida",
        "Soleil direct pendant tout le repas",
    ),
    "Direct sun until {time}": (
        "Sol direto até às {time}",
        "Sol directo hasta las {time}",
        "Soleil direct jusqu'à {time}",
    ),
    "Sun reaches this table at {time}": (
        "O sol chega a esta mesa às {time}",
        "El sol llega a esta mesa a las {time}",
        "Le soleil atteint cette table à {time}",
    ),
    "Sunset at {time} from your seat": (
        "Pôr do sol às {time}, visto do teu lugar",
        "Puesta de sol a las {time} desde tu sitio",
        "Coucher de soleil à {time} depuis votre place",
    ),
    "It gets dark at {time}": (
        "Escurece às {time}",
        "Oscurece a las {time}",
        "La nuit tombe à {time}",
    ),
    "Under the stars": (
        "Sob as estrelas",
        "Bajo las estrellas",
        "Sous les étoiles",
    ),
    "Facing the window": (
        "De frente para a janela",
        "De cara a la ventana",
        "Face à la fenêtre",
    ),
    "Back to the window": (
        "De costas para a janela",
        "De espaldas a la ventana",
        "Dos à la fenêtre",
    ),
    "Side-on to the window": (
        "De lado para a janela",
        "De lado a la ventana",
        "De côté par rapport à la fenêtre",
    ),
}
_INDEX = {"pt": 0, "es": 1, "fr": 2}
_TIME = re.compile(r"\d{2}:\d{2}")
_VIEW = re.compile(r"^View of the (.+)$")


def translate(sentence: str, locale: str | None) -> str | None:
    """The sentence in `locale`; the sentence itself for English; None when it is not one we can translate."""
    if locale not in _INDEX:
        return sentence
    column = _INDEX[locale]
    if sentence in _SENTENCES:
        return _SENTENCES[sentence][column]
    found = _TIME.search(sentence)
    if found:
        key = sentence.replace(found.group(0), "{time}")
        if key in _SENTENCES:
            return _SENTENCES[key][column].replace("{time}", found.group(0))
    view = _VIEW.match(sentence)
    if view:
        return _SENTENCES["View of the {place}"][column].replace("{place}", view.group(1))
    return None
