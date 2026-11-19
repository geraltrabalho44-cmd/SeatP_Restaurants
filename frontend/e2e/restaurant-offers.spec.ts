// Offers (discount coupons) with the real backend: the owner makes a shared offer, a guest arrives with
// its link, applies the code and books, the staff see what to take off the bill, and cancelling gives
// the use back. Offers sent to guests only reach those who said yes to offers.

import { expect, test } from "./fixtures";
import { dinerMap, holdTable, preparedRestaurant, publishRestaurant } from "./restaurant-fixture";

const OFFER = { name: "Spring offer", kind: "percent", value: 10, gift_text: "", audience: "link", rule: null, note: "", starts_on: null, ends_on: null, max_uses: 5, min_party: 1, weekdays: [] };

test("a guest arrives with an offer link, books, and the staff see what to take off the bill", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Offer journey");
  await publishRestaurant(request, venue);
  const made = await request.post(`/api/owner/restaurants/${venue.id}/offers`, { headers: venue.headers, data: OFFER });
  expect(made.status(), await made.text()).toBe(201);
  const { code, id } = (await made.json()) as { code: string; id: number };

  // The link brings the code; the form shows it filled in.
  await page.goto(`/r/${venue.id}?offer=${code}&date=${venue.day}&party=2`);
  await page.getByRole("button", { name: "See free times" }).click();
  await page.getByRole("button", { name: "13:00 Available", exact: true }).click();
  await page.getByRole("button", { name: "Choose a table at 13:00" }).click();
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await expect(panel.getByLabel("Offer code (optional)")).toHaveValue(code);
  await panel.getByLabel("Name for the booking").fill("Offer Diner");
  await panel.getByLabel("Email", { exact: true }).fill("offer.diner@example.com");
  await panel.getByRole("checkbox", { name: /accept the terms/ }).check();
  await panel.getByRole("button", { name: "Apply code" }).click();
  await expect(panel.getByText(/10% off your bill/)).toBeVisible();
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();
  await expect(page.getByTestId("offer-line")).toContainText("Spring offer, 10% off your bill");

  // The staff see it on the floor, and the owner's count goes up.
  const floor = await request.get(`/api/staff/${venue.id}/floor?date=${venue.day}&time=13:00`, { headers: venue.headers });
  const bookings = ((await floor.json()) as { bookings: { offer?: { what: string } }[] }).bookings;
  expect(bookings[0]?.offer?.what).toBe("10% off your bill");
  const uses = async (): Promise<number> => {
    const list = await request.get(`/api/owner/restaurants/${venue.id}/offers`, { headers: venue.headers });
    return ((await list.json()) as { offers: { id: number; uses: number }[] }).offers.find((offer) => offer.id === id)?.uses ?? -1;
  };
  expect(await uses()).toBe(1);

  // Cancelling gives the use back.
  await page.getByRole("link", { name: "Manage booking" }).click();
  await expect(page.getByTestId("offer-line")).toContainText("Spring offer");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText(/This booking is cancelled\./)).toBeVisible();
  await expect.poll(uses).toBe(0);
});

test("a wrong code is explained and nothing is booked", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Offer wrong code");
  await publishRestaurant(request, venue);
  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await panel.getByLabel("Name for the booking").fill("Wrong Code");
  await panel.getByLabel("Email", { exact: true }).fill("wrong.code@example.com");
  await panel.getByRole("checkbox", { name: /accept the terms/ }).check();
  await panel.getByLabel("Offer code (optional)").fill("ZZZZZZZZ");
  await panel.getByRole("button", { name: "Apply code" }).click();
  await expect(panel.getByText("This code is not valid.")).toBeVisible();
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(panel.getByText("This code is not valid.")).toBeVisible();
  const floor = await request.get(`/api/staff/${venue.id}/floor?date=${venue.day}&time=13:00`, { headers: venue.headers });
  expect(((await floor.json()) as { bookings: unknown[] }).bookings).toHaveLength(0);
});

test("an offer sent to guests reaches only those who said yes to offers", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Offer send");
  await publishRestaurant(request, venue);
  const made = await request.post(`/api/owner/restaurants/${venue.id}/offers`, { headers: venue.headers, data: { ...OFFER, audience: "send", max_uses: null } });
  const { id } = (await made.json()) as { id: number };
  // One guest ticks offers while booking; the owner then sees how many can be emailed.
  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await panel.getByLabel("Name for the booking").fill("Yes Diner");
  await panel.getByLabel("Email", { exact: true }).fill("yes.diner@example.com");
  await panel.getByRole("checkbox", { name: /accept the terms/ }).check();
  await panel.getByRole("checkbox", { name: /offers and news/ }).check();
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();

  const reach = await request.post(`/api/owner/restaurants/${venue.id}/offers/audience`, { headers: venue.headers, data: { segment: "all" } });
  expect(await reach.json()).toMatchObject({ in_segment: 1, reachable: 1, skipped_no_consent: 0 });
  const sent = await request.post(`/api/owner/restaurants/${venue.id}/offers/${id}/send`, { headers: venue.headers, data: { segment: "all" } });
  expect(await sent.json()).toMatchObject({ sent: 1 });
  const log = await request.get(`/api/emails/log?limit=20`, { headers: venue.headers });
  const kinds = ((await log.json()) as { kind: string }[]).map((row) => row.kind);
  expect(kinds).toContain("offer");
});
