// Restaurant vertical: a diner books a table and cancels it through the
// manage link; a member of staff seats a walk-in from the live floor.

import { STAFF, demoLinks, expect, isoDaysFromToday, lastPart, signIn, test } from "./fixtures";

test("a diner books a table, then cancels through the manage link", async ({ page, request }) => {
  const links = await demoLinks(request);
  // Two days ahead: never in the past, and never the demo's closed day (21 days ahead).
  await page.goto(`${links.restaurant_booking}?date=${isoDaysFromToday(2)}&party=2`);

  await page.getByRole("button", { name: "See free times" }).click();
  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  await page.getByRole("button", { name: /^\d\d:\d\d Available$/ }).first().click();
  await page.getByRole("button", { name:/^Choose a table at/ }).click();

  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  await page.getByRole("button", { name: "Choose for me" }).click();
  // The table is held and the details form opens beside the plan; the chair is optional and this diner skips it.
  await expect(page.getByRole("form", { name: "Your details" })).toBeVisible();

  await page.getByLabel("Name for the booking").fill("Tess Diner");
  await page.getByLabel("Email", { exact: true }).fill("tess.diner@example.com");
  await page.getByRole("checkbox", { name: /accept the terms/ }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();

  // The confirmation page alone is enough to manage the booking.
  await page.getByRole("link", { name: "Manage booking" }).click();
  await expect(page).toHaveURL(/\/b\/[^/]+$/);
  const token = lastPart(new URL(page.url()).pathname);
  await expect(page.getByRole("heading", { name: "Your booking" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("This booking is cancelled.")).toBeVisible();

  const stored = await request.get(`/api/b/${token}`);
  expect(stored.status()).toBe(200);
  expect(((await stored.json()) as { status: string }).status).toBe("cancelled");
});

test("a diner picks a chair and sees it on the confirmation", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(`${links.restaurant_booking}?date=${isoDaysFromToday(3)}&party=2`);
  await page.getByRole("button", { name: "See free times" }).click();
  await page.getByRole("button", { name: /^\d\d:\d\d Available$/ }).first().click();
  await page.getByRole("button", { name:/^Choose a table at/ }).click();
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  await page.getByRole("button", { name: "Choose for me" }).click();
  await page.getByText("Occasion, dietary preferences, allergies and a chair").click(); // the chair waits in the closed sub menu
  await page.getByRole("button", { name: "Choose a chair" }).click();

  await expect(page.getByRole("heading", { name: /Request a chair/ })).toBeVisible();
  // The demo's chairs are labelled like "W2-2": take the second one, whatever the table is called.
  const second = page.getByRole("radio").nth(1);
  const seat = ((await second.evaluate((el) => el.parentElement?.textContent ?? "")).split(" · ")[0] ?? "").trim();
  await second.check();
  await page.getByRole("button", { name: "Save chair request" }).click();

  await page.getByLabel("Name for the booking").fill("Chair Diner");
  await page.getByLabel("Email", { exact: true }).fill("chair.diner@example.com");
  await page.getByRole("checkbox", { name: /accept the terms/ }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();
  await expect(page.getByText(seat, { exact: false }).first()).toBeVisible();
});

