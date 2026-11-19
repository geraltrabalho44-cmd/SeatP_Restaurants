"""The email that carries an offer from a restaurant to a guest who said yes to offers.

It always says who it is from, why the guest got it, and how to stop in one link. It reuses the
shared layout of every SeatPlan email, so it looks like the rest. Nothing here reads the
database: every value arrives formatted.
"""

from app.mail.templates import EmailParts, _compose, _one_line


def offer_email(
    *,
    guest_name: str,
    restaurant: str,
    offer_name: str,
    what: str,
    code: str,
    valid_until: str | None,
    note: str,
    book_link: str,
    stop_link: str,
) -> EmailParts:
    paragraphs = [f"{restaurant} has an offer for you: {what}."]
    if note.strip():
        paragraphs.append(_one_line(note))
    paragraphs.append(
        f"Your code is {code}. It is filled in for you when you book with the button below."
    )
    paragraphs.append(
        f"It is valid until {valid_until}."
        if valid_until
        else "It has no end date, but places are limited."
    )
    reason = f"You received this because you said yes to offers from {restaurant} when you booked."
    stop = f"To stop offers from {restaurant}, use this link: {stop_link}"
    return _compose(
        f"{restaurant}: {offer_name}",
        guest_name,
        paragraphs,
        "Book a table with this offer",
        book_link,
        reason,
        stop,
    )
