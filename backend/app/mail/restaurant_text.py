"""The words of the restaurant booking emails, in the language the diner booked in.

Four languages: English, Portuguese (tu, like the site), Spanish (tú) and French (vous). `text(key, locale, **values)` falls
back to English for an unknown language or key, so an email is never empty. Dates are written with the short day and month
names of the language ("sex 20 nov"), not with the server's locale, so the same code gives the same email anywhere.

What stays in English on purpose: the ambience sentences ("Direct sun until 14:30") and the sentence about the chair, which come
from the server in English and are translated only on the site. In a Portuguese, Spanish or French email they are left out
instead of mixing languages (see email_facts.py).
"""

from datetime import datetime

LOCALES = ("en", "pt", "es", "fr")
DEFAULT = "en"

# key -> {language: text with {placeholders}}
_TEXT: dict[str, dict[str, str]] = {
    "hello_name": {
        "en": "Hello {name},",
        "pt": "Olá {name},",
        "es": "Hola {name},",
        "fr": "Bonjour {name},",
    },
    "hello": {"en": "Hello,", "pt": "Olá,", "es": "Hola,", "fr": "Bonjour,"},
    "opening_confirmed": {
        "en": "You're booked at {restaurant}.",
        "pt": "A tua reserva em {restaurant} está confirmada.",
        "es": "Tu reserva en {restaurant} está confirmada.",
        "fr": "Votre réservation chez {restaurant} est confirmée.",
    },
    "opening_changed": {
        "en": "Your booking at {restaurant} has been updated.",
        "pt": "A tua reserva em {restaurant} foi atualizada.",
        "es": "Tu reserva en {restaurant} se ha actualizado.",
        "fr": "Votre réservation chez {restaurant} a été modifiée.",
    },
    "opening_reminder": {
        "en": "A reminder of your booking at {restaurant}.",
        "pt": "Um lembrete da tua reserva em {restaurant}.",
        "es": "Un recordatorio de tu reserva en {restaurant}.",
        "fr": "Un rappel de votre réservation chez {restaurant}.",
    },
    "closing": {
        "en": "You can change or cancel the booking, or pick another chair, with the link below.",
        "pt": "Podes alterar ou cancelar a reserva, ou escolher outra cadeira, com a ligação abaixo.",
        "es": "Puedes cambiar o cancelar la reserva, o elegir otra silla, con el enlace de abajo.",
        "fr": "Vous pouvez modifier ou annuler la réservation, ou choisir une autre chaise, avec le lien ci-dessous.",
    },
    "closing_reminder": {
        "en": "If you cannot come, please cancel with the link below so someone else can have the table.",
        "pt": "Se não puderes vir, cancela com a ligação abaixo para que outra pessoa possa ficar com a mesa.",
        "es": "Si no puedes venir, cancela con el enlace de abajo para que otra persona pueda tener la mesa.",
        "fr": "Si vous ne pouvez pas venir, annulez avec le lien ci-dessous pour qu'une autre personne puisse avoir la table.",
    },
    "subject_confirmed": {"en": "Booked", "pt": "Reservado", "es": "Reservado", "fr": "Réservé"},
    "subject_changed": {"en": "Updated", "pt": "Atualizada", "es": "Actualizada", "fr": "Modifiée"},
    "subject_reminder": {"en": "Reminder", "pt": "Lembrete", "es": "Recordatorio", "fr": "Rappel"},
    "subject": {
        "en": "{head}: {restaurant}, {day} at {time}",
        "pt": "{head}: {restaurant}, {day} às {time}",
        "es": "{head}: {restaurant}, {day} a las {time}",
        "fr": "{head} : {restaurant}, {day} à {time}",
    },
    "label_date": {"en": "Date", "pt": "Data", "es": "Fecha", "fr": "Date"},
    "label_time": {"en": "Time", "pt": "Hora", "es": "Hora", "fr": "Heure"},
    "label_people": {"en": "People", "pt": "Pessoas", "es": "Personas", "fr": "Personnes"},
    "label_table": {"en": "Your table", "pt": "A tua mesa", "es": "Tu mesa", "fr": "Votre table"},
    "label_deposit": {"en": "Deposit", "pt": "Depósito", "es": "Depósito", "fr": "Acompte"},
    "party_one": {"en": "1 person", "pt": "1 pessoa", "es": "1 persona", "fr": "1 personne"},
    "party_many": {
        "en": "{n} people",
        "pt": "{n} pessoas",
        "es": "{n} personas",
        "fr": "{n} personnes",
    },
    "table": {
        "en": "Table {label}",
        "pt": "Mesa {label}",
        "es": "Mesa {label}",
        "fr": "Table {label}",
    },
    "seat": {
        "en": "Seat {label}",
        "pt": "Lugar {label}",
        "es": "Asiento {label}",
        "fr": "Place {label}",
    },
    "where": {"en": "Where", "pt": "Onde", "es": "Dónde", "fr": "Où"},
    "map": {"en": "Map", "pt": "Mapa", "es": "Mapa", "fr": "Plan"},
    "html_note": {
        "en": "The HTML version of this email shows the room from above.",
        "pt": "A versão HTML deste email mostra a sala vista de cima.",
        "es": "La versión HTML de este email muestra la sala vista desde arriba.",
        "fr": "La version HTML de cet email montre la salle vue de dessus.",
    },
    "manage": {
        "en": "Manage my booking",
        "pt": "Gerir a minha reserva",
        "es": "Gestionar mi reserva",
        "fr": "Gérer ma réservation",
    },
    "button_help": {
        "en": "If the button does not work, copy this link:",
        "pt": "Se o botão não funcionar, copia esta ligação:",
        "es": "Si el botón no funciona, copia este enlace:",
        "fr": "Si le bouton ne fonctionne pas, copiez ce lien :",
    },
    "team": {
        "en": "The {sender} team",
        "pt": "A equipa {sender}",
        "es": "El equipo de {sender}",
        "fr": "L'équipe {sender}",
    },
    "reason": {
        "en": "You received this email because you made a booking at {restaurant}.",
        "pt": "Recebeste este email porque fizeste uma reserva em {restaurant}.",
        "es": "Has recibido este email porque hiciste una reserva en {restaurant}.",
        "fr": "Vous recevez cet email car vous avez réservé chez {restaurant}.",
    },
    # The footer does not say "we never send marketing": a diner may have ticked the box for the restaurant's offers.
    "stop": {
        "en": (
            "This email is only about your booking. To stop these emails, cancel the booking with the link above: you will "
            "get nothing more about it. If you ticked the box for offers from this restaurant, those arrive in separate "
            "emails and each has its own link to stop them."
        ),
        "pt": (
            "Este email é só sobre a tua reserva. Para deixares de os receber, cancela a reserva com a ligação acima: não "
            "recebes mais nada sobre ela. Se marcaste a caixa das ofertas deste restaurante, essas chegam em emails à "
            "parte e cada um tem a sua própria ligação para os parares."
        ),
        "es": (
            "Este email es solo sobre tu reserva. Para dejar de recibirlos, cancela la reserva con el enlace de arriba: no "
            "recibirás nada más sobre ella. Si marcaste la casilla de ofertas de este restaurante, esas llegan en emails "
            "aparte y cada uno tiene su propio enlace para darte de baja."
        ),
        "fr": (
            "Cet email ne concerne que votre réservation. Pour ne plus les recevoir, annulez la réservation avec le lien "
            "ci-dessus : vous ne recevrez plus rien à son sujet. Si vous avez coché la case des offres de ce restaurant, "
            "elles arrivent dans des emails séparés, chacun avec son propre lien pour les arrêter."
        ),
    },
    "picture_alt": {
        "en": "Floor plan of {restaurant} seen from above. Your table, table {table}, is highlighted in yellow",
        "pt": "Planta de {restaurant} vista de cima. A tua mesa, a mesa {table}, está destacada a amarelo",
        "es": "Plano de {restaurant} visto desde arriba. Tu mesa, la mesa {table}, está resaltada en amarillo",
        "fr": "Plan de {restaurant} vu de dessus. Votre table, la table {table}, est en jaune",
    },
    "picture_alt_seat": {
        "en": ", and your chair, seat {seat}, is marked with a large black dot inside a ring",
        "pt": ", e a tua cadeira, o lugar {seat}, está marcada com um ponto preto grande dentro de um anel",
        "es": ", y tu silla, el asiento {seat}, está marcada con un punto negro grande dentro de un anillo",
        "fr": ", et votre chaise, la place {seat}, est marquée d'un grand point noir dans un anneau",
    },
    "deposit_line": {
        "en": "{amount}, taken off your bill. Free cancellation until {when}.",
        "pt": "{amount}, descontados na conta. Cancelamento gratuito até {when}.",
        "es": "{amount}, descontados de tu cuenta. Cancelación gratuita hasta {when}.",
        "fr": "{amount}, déduits de votre addition. Annulation gratuite jusqu'au {when}.",
    },
}

_DAYS = {
    "en": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"),
    "pt": ("seg", "ter", "qua", "qui", "sex", "sáb", "dom"),
    "es": ("lun", "mar", "mié", "jue", "vie", "sáb", "dom"),
    "fr": ("lun", "mar", "mer", "jeu", "ven", "sam", "dim"),
}
_MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
    "pt": ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"),
    "es": ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"),
    "fr": (
        "janv",
        "févr",
        "mars",
        "avr",
        "mai",
        "juin",
        "juil",
        "août",
        "sept",
        "oct",
        "nov",
        "déc",
    ),
}


def known(locale: str | None) -> str:
    """The language to write in: the given one if we have it, else English."""
    return locale if locale in LOCALES else DEFAULT


def text(key: str, locale: str | None, **values: object) -> str:
    """The sentence `key` in `locale` (English if that language lacks it), with {placeholders} filled in."""
    table = _TEXT[key]
    return table.get(known(locale), table[DEFAULT]).format(**values)


def party(size: int, locale: str | None) -> str:
    return text("party_one", locale) if size == 1 else text("party_many", locale, n=size)


def short_day(moment: datetime, locale: str | None) -> str:
    """ "Fri 21 Nov" / "sex 21 nov": the day of a booking in the venue's local time (pass a local datetime)."""
    lang = known(locale)
    return f"{_DAYS[lang][moment.weekday()]} {moment.day:02d} {_MONTHS[lang][moment.month - 1]}"


def day_and_time(moment: datetime, locale: str | None) -> str:
    """ "Fri 20 Nov, 19:30" / "sex 20 nov, 19:30" (local datetime). The day number has no leading zero."""
    lang = known(locale)
    return f"{_DAYS[lang][moment.weekday()]} {moment.day} {_MONTHS[lang][moment.month - 1]}, {moment:%H:%M}"
