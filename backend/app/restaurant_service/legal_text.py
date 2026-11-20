"""The terms and privacy notice a diner accepts on the last step of a booking.

THIS IS A DRAFT written by the team, not legal advice. A lawyer must review it before a real
restaurant uses it (see docs/handoff and the consent section of the changelog). It is built from
fixed sentences, never from anything a diner typed, and carries a version: when any sentence
changes, bump TERMS_VERSION so every consent record says which words the diner actually saw.

Who is who (our reading of the GDPR): the restaurant decides why and how its guests' data is used,
so it is the controller; SeatPlan stores and sends it on the restaurant's behalf, so it is the
processor. The restaurant may add its own text (contact for data requests, house rules).
"""

from typing import Any

TERMS_VERSION = "2026-11-20"
OFFERS_VERSION = "2026-11-18"
EXTRA_MAX = 2000

TERMS_LABEL = "I accept the terms and conditions and the privacy notice."
OFFERS_LABEL = "I'd like to receive offers and news from this restaurant (optional)."
OFFERS_HINT = (
    "Only from this restaurant, by email or phone. You can stop at any time with the link in "
    "every message. Not ticking this changes nothing about your booking."
)


def document(restaurant_name: str, extra_text: str, demo: bool) -> dict[str, Any]:
    """The whole document: a title, sections of paragraphs, and the labels of the two boxes."""
    name = restaurant_name
    sections: list[dict[str, Any]] = [
        {
            "title": "Who is responsible for your data",
            "paragraphs": [
                (
                    f"{name} is responsible for the personal data it collects when you book a table. "
                    "SeatPlan, the booking service, stores and sends that data on the restaurant's "
                    "behalf and does not use it for anything else."
                ),
            ],
        },
        {
            "title": "What we collect and why",
            "paragraphs": [
                (
                    "We collect what you type when you book: your name, email address, phone number "
                    "(if you give one), notes, dietary needs and allergies, and the details of the "
                    "booking (day, time, party size, table)."
                ),
                (
                    "We use it to make and manage your booking, to send you the confirmation and "
                    "reminders you asked for, to prepare your visit and keep you safe if you tell us "
                    "about an allergy, and to protect the restaurant against no-shows."
                ),
                (
                    f"{name} also uses booking data to keep statistics about its own business, such "
                    "as how many guests it has, which days are busiest and which guests come back. "
                    "These statistics are seen only by the restaurant."
                ),
            ],
        },
        {
            "title": "Offers and news (only if you tick the second box)",
            "paragraphs": [
                (
                    f"If you tick the optional box, {name} may send you offers, discounts and news "
                    "by email or phone. This is your choice, it is not needed to book, and you can "
                    "withdraw it at any time with the link in every message or on your booking page. "
                    "If you do not tick it, you will not receive offers."
                ),
            ],
        },
        {
            "title": "Who else sees your data",
            "paragraphs": [
                (
                    "Only the services needed to run the booking: hosting, sending emails, text "
                    "messages and, if the restaurant asks for a deposit, the payment provider. We "
                    "do not sell your data. The maps on this site are loaded by your browser from "
                    "OpenFreeMap and OpenStreetMap, which see your internet address but nothing "
                    "about your booking."
                ),
            ],
        },
        {
            "title": "How long it is kept",
            "paragraphs": [
                (
                    "Phone numbers given for reminders are deleted 30 days after your visit. Other "
                    f"booking data is kept by {name} for as long as it needs it to run its service "
                    "and its statistics, and you can ask for it to be deleted."
                ),
            ],
        },
        {
            "title": "Your rights",
            "paragraphs": [
                (
                    "You can ask the restaurant to show you your data, correct it, delete it or "
                    "restrict how it is used, and you can object to its use. You can also complain "
                    "to the Portuguese data protection authority (CNPD). To use any right, contact "
                    "the restaurant using the details below."
                ),
            ],
        },
        {
            "title": "The booking itself",
            "paragraphs": [
                (
                    "Your table is held for you for the booked time. If you cannot come, please "
                    "cancel with your booking link (shown when you book and in your confirmation "
                    "email) so someone else can have the table. If the restaurant asks for a deposit, its own rule is shown before you "
                    "confirm and that rule applies."
                ),
            ],
        },
    ]
    extra = extra_text.strip()
    if extra:
        sections.append({"title": f"From {name}", "paragraphs": extra.split("\n\n")})
    return {
        "version": TERMS_VERSION,
        "offers_version": OFFERS_VERSION,
        "title": f"Terms and privacy: {name}",
        "sections": sections,
        "terms_label": TERMS_LABEL,
        "offers_label": OFFERS_LABEL,
        "offers_hint": OFFERS_HINT,
        # Shown only on demo restaurants, so nobody mistakes the demo for reviewed legal text.
        "draft": demo,
    }
