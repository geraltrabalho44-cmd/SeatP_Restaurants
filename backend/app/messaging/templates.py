"""The words of every phone message, for SMS and for WhatsApp.

SMS text is plain ASCII (GSM-7: no accents, curly quotes or emoji), so one message
fits in a single 160-character segment and costs one. No diner name is ever in a
message: the phone may be shared, and a name is not needed to find the booking.
WhatsApp does not let a business start a chat with free text: it sends a template
Meta has approved, with the blanks filled in. Each Message carries both forms.
"""

import unicodedata
from dataclasses import dataclass

NAME_MAX = 22
SMS_MAX = 160


@dataclass(frozen=True)
class Facts:
    venue_name: str
    when: str  # "Fri 20 Nov 19:30"
    party: int
    table: str = ""

    @property
    def clock(self) -> str:
        """Just the time of day: 'Wed 18 Nov, 19:45' -> '19:45'."""
        return self.when.rsplit(",", 1)[-1].strip()


@dataclass(frozen=True)
class Message:
    kind: str
    sms: str
    template: str  # the WhatsApp template's name
    params: tuple[str, ...]  # its {{1}}, {{2}}... in order
    button: str | None = None  # the end of the template's link button (action token or code)


def ascii_fold(text: str) -> str:
    """'Café Príncipe' -> 'Cafe Principe'; anything that is still not ASCII is dropped."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(plain.split())


def short_name(name: str) -> str:
    folded = ascii_fold(name)
    return folded if len(folded) <= NAME_MAX else folded[: NAME_MAX - 1].rstrip() + "."


def code_message(code: str) -> Message:
    return Message(
        "phone_code",
        f"SeatPlan code: {code}. It expires in 10 minutes. Do not share it.",
        "seatplan_code_v1",
        (code,),
        button=code,
    )


def confirmed(facts: Facts, link: str, token: str) -> Message:
    name = short_name(facts.venue_name)
    return Message(
        "booking_confirmed",
        f"SeatPlan: Booked at {name}, {facts.when}, {facts.party} people. Confirm or cancel: {link}",
        "seatplan_booking_confirmed_v1",
        (facts.venue_name, facts.when, str(facts.party), facts.table or "-"),
        button=token,
    )


def reminder_24h(facts: Facts, link: str, token: str) -> Message:
    name = short_name(facts.venue_name)
    return Message(
        "reminder_24h",
        f"SeatPlan: {facts.when} at {name}, {facts.party} people. "
        f"Still coming? Confirm or cancel: {link}",
        "seatplan_reminder_v1",
        (facts.venue_name, facts.when, str(facts.party)),
        button=token,
    )


def reminder_3h(facts: Facts, link: str, token: str) -> Message:
    name = short_name(facts.venue_name)
    return Message(
        "reminder_3h",
        f"SeatPlan: Today {facts.clock} at {name}, {facts.party} people. "
        f"Can't come? Cancel so others can eat: {link}",
        "seatplan_reminder_v1",
        (facts.venue_name, f"today at {facts.clock}", str(facts.party)),
        button=token,
    )


def cancelled(facts: Facts) -> Message:
    name = short_name(facts.venue_name)
    return Message(
        "booking_cancelled",
        f"SeatPlan: Your booking at {name}, {facts.when}, is cancelled.",
        "seatplan_booking_cancelled_v1",
        (facts.venue_name, facts.when),
    )
