// The last step of a booking, with the real backend: the terms must be accepted, offers are a separate
// optional choice, and the diner can change that choice from their booking page. The owner's guest book
// shows who accepted offers.

import { expect, test } from "./fixtures";
import { dinerMap, holdTable, preparedRestaurant, publishRestaurant } from "./restaurant-fixture";

test("terms are required, offers are optional, and the diner can take offers back", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Consent journey");
  await publishRestaurant(request, venue);
  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");

  const panel = page.getByRole("form", { name: "Your details" });
  await panel.getByLabel("Name for the booking").fill("Consent Diner");
  await panel.getByLabel("Email", { exact: true }).fill("consent.diner@example.com");

  // Nothing is pre-ticked. Without the terms nothing is booked.
  const terms = panel.getByRole("checkbox", { name: /accept the terms/ });
  const offers = panel.getByRole("checkbox", { name: /offers and news from this restaurant/ });
  await expect(terms).not.toBeChecked();
  await expect(offers).not.toBeChecked();
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(panel.getByText("Please accept the terms and conditions to book this table.")).toBeVisible();

  // The terms open in a window, with the restaurant's name, without leaving the form.
  await panel.getByRole("button", { name: "Read the terms and privacy notice" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Consent journey");
  await expect(dialog).toContainText("statistics");
  await dialog.getByRole("button", { name: "Accept and close" }).click();
  await expect(terms).toBeChecked();
  await expect(offers).not.toBeChecked(); // accepting the terms never accepts offers

  await offers.check();
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();

  // The owner sees this guest among those who accept offers.
  const guests = await request.get(`/api/owner/restaurants/${venue.id}/guests?segment=offers`, { headers: venue.headers });
  const book = (await guests.json()) as { guests: { email: string; offers: boolean }[] };
  expect(book.guests.map((guest) => guest.email)).toEqual(["consent.diner@example.com"]);

  // The diner changes their mind on the booking page.
  await page.getByRole("link", { name: "Manage booking" }).click();
  const choice = page.getByRole("region", { name: "Offers" }).getByRole("checkbox");
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await expect(choice).not.toBeChecked();
  await expect.poll(async () => {
    const after = await request.get(`/api/owner/restaurants/${venue.id}/guests?segment=offers`, { headers: venue.headers });
    return ((await after.json()) as { guests: unknown[] }).guests.length;
  }).toBe(0);
});

test("going to pick a chair and coming back keeps what was ticked", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Consent kept");
  await publishRestaurant(request, venue);
  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await panel.getByRole("checkbox", { name: /accept the terms/ }).check();
  await panel.getByRole("checkbox", { name: /offers and news/ }).check();
  await panel.getByRole("button", { name: "Choose a chair" }).click();
  await expect(page.getByRole("heading", { name: /Request a chair/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue without a request" }).click();
  const again = page.getByRole("form", { name: "Your details" });
  await expect(again.getByRole("checkbox", { name: /accept the terms/ })).toBeChecked();
  await expect(again.getByRole("checkbox", { name: /offers and news/ })).toBeChecked();
});
