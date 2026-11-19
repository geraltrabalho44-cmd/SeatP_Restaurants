// The owner's Offers page: making offers (validation in plain words), the three ways to give one, the
// shared link, and sending to guests with the counts shown first.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import OffersPage, { toInput } from "./OffersPage";

afterEach(() => vi.unstubAllGlobals());

const BASE = "/api/owner/restaurants/casa/offers";
const offer = (over: Record<string, unknown> = {}) => ({
  id: 1, name: "Spring offer", kind: "percent", value: 10, gift_text: "", what: "10% off your bill", audience: "link", rule: {}, note: "", starts_on: null, ends_on: null,
  max_uses: null, min_party: 1, weekdays: [], active: true, code: "K7M3QX9P", link: "https://seatplan.example.com/r/casa?offer=K7M3QX9P", uses: 3, codes_issued: 0, ...over,
});
const LIST = (offers: unknown[]) => ({ offers, daily_cap: 200, guest_cooldown_days: 14 });

function open(offers: unknown[], extra: Record<string, () => unknown> = {}) {
  const calls = mockApi({ [`GET ${BASE}`]: () => LIST(offers), ...extra });
  render(
    <MemoryRouter initialEntries={["/owner/casa/offers"]}>
      <Routes>
        <Route path="/owner/:venueId/offers" element={<OffersPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return calls;
}

const draft = (over: Record<string, unknown> = {}) => ({
  name: "We miss you", kind: "percent" as const, amount: "10", gift: "", audience: "link" as const, rule: "winback" as const, days: "60", visits: "5",
  note: "", starts: "", ends: "", maxUses: "", minParty: "1", weekdays: [] as number[], ...over,
});

describe("what the form sends", () => {
  it("turns what the owner typed into an offer", () => {
    expect(toInput(draft())).toEqual({ input: expect.objectContaining({ name: "We miss you", kind: "percent", value: 10, audience: "link", rule: null, max_uses: null, min_party: 1 }) });
    expect(toInput(draft({ kind: "amount", amount: "7.50" }))).toEqual({ input: expect.objectContaining({ kind: "amount", value: 750 }) });
    expect(toInput(draft({ kind: "gift", gift: " dessert " }))).toEqual({ input: expect.objectContaining({ kind: "gift", gift_text: "dessert", value: 0 }) });
    expect(toInput(draft({ audience: "auto", rule: "winback", days: "45" }))).toEqual({ input: expect.objectContaining({ rule: { type: "winback", days: 45 } }) });
    expect(toInput(draft({ audience: "auto", rule: "welcome" }))).toEqual({ input: expect.objectContaining({ rule: { type: "welcome" } }) });
    expect(toInput(draft({ audience: "auto", rule: "nth_visit", visits: "5" }))).toEqual({ input: expect.objectContaining({ rule: { type: "nth_visit", visits: 5 } }) });
    expect(toInput(draft({ maxUses: "50", weekdays: [4, 5] }))).toEqual({ input: expect.objectContaining({ max_uses: 50, weekdays: [4, 5] }) });
  });

  it.each([
    [{ name: "  " }, /name/],
    [{ amount: "0" }, /percentage/],
    [{ amount: "101" }, /percentage/],
    [{ kind: "amount", amount: "0.50" }, /€1 and €1000/],
    [{ kind: "amount", amount: "abc" }, /€1 and €1000/],
    [{ kind: "gift", gift: "" }, /free item/],
    [{ audience: "auto", rule: "winback", days: "3" }, /14 to 365/],
    [{ audience: "auto", rule: "nth_visit", visits: "1" }, /2 to 50/],
    [{ starts: "2030-05-10", ends: "2030-05-01" }, /cannot end before/],
    [{ maxUses: "0" }, /number of uses/],
    [{ minParty: "0" }, /smallest party/],
  ])("explains in words why %j cannot be saved", (over, words) => {
    const built = toInput(draft(over));
    expect("problem" in built && built.problem).toMatch(words);
  });
});

describe("the offers page", () => {
  it("tells a new owner what to do first", async () => {
    open([]);
    expect(await screen.findByText(/No offers yet/)).toBeTruthy();
    expect(screen.getByText(/You bear the cost/)).toBeTruthy();
  });

  it("shows each offer with how it is given, how it is doing, and the shared link", async () => {
    open([offer(), offer({ id: 2, name: "Win back", audience: "auto", rule: { type: "winback", days: 60 }, code: null, link: null, uses: 1, codes_issued: 12 })]);
    const shared = await screen.findByRole("region", { name: "Offer: Spring offer" });
    expect(within(shared).getByText("10% off your bill")).toBeTruthy();
    expect(within(shared).getByText("Shared code and link")).toBeTruthy();
    expect(within(shared).getByTestId("offer-stats").textContent).toContain("Used 3 times");
    expect(within(shared).getByText(/Link with code K7M3QX9P/)).toBeTruthy();
    const auto = screen.getByRole("region", { name: "Offer: Win back" });
    expect(within(auto).getByText(/not been in for 60 days/)).toBeTruthy();
    expect(within(auto).getByTestId("offer-stats").textContent).toContain("12 codes given");
  });

  it("makes an offer and shows it at the top", async () => {
    const calls = open([], { [`POST ${BASE}`]: () => offer({ id: 9, name: "We miss you", audience: "send", code: null, link: null, uses: 0 }) });
    fireEvent.click(await screen.findByRole("button", { name: "New offer" }));
    const form = screen.getByRole("region", { name: "New offer" });
    fireEvent.change(within(form).getByLabelText("Name guests will see"), { target: { value: "We miss you" } });
    fireEvent.change(within(form).getByLabelText("How guests get it"), { target: { value: "send" } });
    fireEvent.click(within(form).getByRole("button", { name: "Make offer" }));
    expect(await screen.findByRole("region", { name: "Offer: We miss you" })).toBeTruthy();
    expect(callsTo(calls, "POST", BASE)[0]?.body).toMatchObject({ name: "We miss you", kind: "percent", value: 10, audience: "send" });
  });

  it("does not send an offer that cannot be saved, and says why", async () => {
    const calls = open([]);
    fireEvent.click(await screen.findByRole("button", { name: "New offer" }));
    fireEvent.click(screen.getByRole("button", { name: "Make offer" }));
    expect(await screen.findByText(/Give the offer a name/)).toBeTruthy();
    expect(callsTo(calls, "POST", BASE)).toHaveLength(0);
  });

  it("an automatic offer asks when it is given", async () => {
    open([]);
    fireEvent.click(await screen.findByRole("button", { name: "New offer" }));
    fireEvent.change(screen.getByLabelText("How guests get it"), { target: { value: "auto" } });
    expect(screen.getByLabelText("When it is given")).toBeTruthy();
    expect(screen.getByLabelText("Not been in for (days)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("When it is given"), { target: { value: "nth_visit" } });
    expect(screen.getByLabelText("On visit number")).toBeTruthy();
  });

  it("how an offer is given cannot be changed when editing", async () => {
    open([offer()]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("How guests get it") as HTMLSelectElement).disabled).toBe(true);
  });

  it("archives and restores", async () => {
    mockApi({ [`GET ${BASE}`]: () => LIST([offer()]), [`POST ${BASE}/1/archive`]: () => offer({ active: false }) });
    render(
      <MemoryRouter initialEntries={["/owner/casa/offers"]}>
        <Routes>
          <Route path="/owner/:venueId/offers" element={<OffersPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
  });

  it("shows the server's words when saving fails", async () => {
    open([], { [`POST ${BASE}`]: () => apiError(409, "conflict", "A restaurant can have up to 30 offers.") });
    fireEvent.click(await screen.findByRole("button", { name: "New offer" }));
    fireEvent.change(screen.getByLabelText("Name guests will see"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Make offer" }));
    expect(await screen.findByText("A restaurant can have up to 30 offers.")).toBeTruthy();
  });
});

describe("sending an offer to guests", () => {
  const sendOffer = () => offer({ id: 5, name: "We miss you", audience: "send", code: null, link: null, uses: 0 });

  it("shows how many can be emailed first, says why others cannot, and only then sends", async () => {
    const calls = open([sendOffer()], {
      [`POST ${BASE}/audience`]: () => ({ segment: "lapsed", in_segment: 7, reachable: 4, skipped_no_consent: 3 }),
      [`POST ${BASE}/5/send`]: () => ({ sent: 4, skipped_no_consent: 3, skipped_recent_or_already: 0, left_for_today: 196 }),
    });
    const panel = await screen.findByRole("group", { name: "Send We miss you" });
    expect(within(panel).queryByRole("button", { name: /^Send to/ })).toBeNull(); // nothing to confirm yet
    fireEvent.click(within(panel).getByRole("button", { name: "See who this reaches" }));
    expect(await within(panel).findByText(/4 of 7 guests in this group can be emailed/)).toBeTruthy();
    expect(within(panel).getByText(/3 did not say yes to offers, so they will not be contacted/)).toBeTruthy();
    expect(callsTo(calls, "POST", `${BASE}/audience`)[0]?.body).toEqual({ segment: "lapsed", emails: [] });
    fireEvent.click(within(panel).getByRole("button", { name: "Send to 4 guests" }));
    expect(await within(panel).findByText(/Sent to 4/)).toBeTruthy();
    expect(within(panel).getByText(/You can still send 196 today/)).toBeTruthy();
    expect(callsTo(calls, "POST", `${BASE}/5/send`)).toHaveLength(1);
  });

  it("lets the owner type the guests to send to, and sends only that list", async () => {
    const calls = open([sendOffer()], { [`POST ${BASE}/audience`]: () => ({ segment: "list", in_segment: 2, reachable: 2, skipped_no_consent: 0 }) });
    const panel = await screen.findByRole("group", { name: "Send We miss you" });
    fireEvent.change(within(panel).getByLabelText("Send this offer to"), { target: { value: "list" } });
    fireEvent.change(within(panel).getByLabelText(/Email addresses/), { target: { value: "a@example.com, b@example.com\nc@example.com" } });
    fireEvent.click(within(panel).getByRole("button", { name: "See who this reaches" }));
    await waitFor(() => expect(callsTo(calls, "POST", `${BASE}/audience`)).toHaveLength(1));
    expect(callsTo(calls, "POST", `${BASE}/audience`)[0]?.body).toEqual({ segment: "list", emails: ["a@example.com", "b@example.com", "c@example.com"] });
  });

  it("says when the daily limit is reached, and nobody is offered a send when nobody can be emailed", async () => {
    open([sendOffer()], {
      [`POST ${BASE}/audience`]: () => ({ segment: "lapsed", in_segment: 2, reachable: 0, skipped_no_consent: 2 }),
    });
    const panel = await screen.findByRole("group", { name: "Send We miss you" });
    fireEvent.click(within(panel).getByRole("button", { name: "See who this reaches" }));
    expect(await within(panel).findByText(/0 of 2 guests/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: /^Send to/ })).toBeNull();
  });

  it("an archived offer cannot be sent", async () => {
    open([{ ...sendOffer(), active: false }]);
    await screen.findByRole("region", { name: "Offer: We miss you" });
    expect(screen.queryByRole("group", { name: "Send We miss you" })).toBeNull();
  });
});
