// Phone reminders, end to end with the real backend and the demo provider (nothing is sent):
// the owner turns SMS on, a diner ticks the box, proves the number with the code shown on screen,
// books, and the owner's log shows the message with the number masked.

import { expect, test } from "./fixtures";
import { dinerMap, holdTable, preparedRestaurant, publishRestaurant } from "./restaurant-fixture";

const SETTINGS = { sms_enabled: true, whatsapp_enabled: false, send_confirmation: true, reminder_24h: true, reminder_3h: true, monthly_cap: 300 };

test("a diner proves a phone number and books, and the owner sees the masked message", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Phone reminders");
  await publishRestaurant(request, venue);
  const saved = await request.put(`/api/owner/restaurants/${venue.id}/messages`, { headers: venue.headers, data: SETTINGS });
  expect(saved.status(), await saved.text()).toBe(200);

  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await panel.getByLabel("Name for the booking").fill("Phone Diner");
  await panel.getByLabel("Email", { exact: true }).fill("phone.diner@example.com");
  await panel.getByRole("checkbox", { name: /accept the terms/ }).check();

  // Nothing is pre-ticked. Ticking without verifying blocks the booking, and says why.
  const box = panel.getByRole("checkbox", { name: /Send me booking messages/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(panel.getByText("Verify your number, or untick the box to book without phone messages.")).toBeVisible();

  // A landline is refused; a Portuguese mobile gets a code (shown on screen in demo mode).
  await panel.getByLabel("Mobile number").fill("210 123 456");
  await panel.getByRole("button", { name: "Send code" }).click();
  await expect(panel.getByText(/does not look like a Portuguese mobile number/)).toBeVisible();
  await panel.getByLabel("Mobile number").fill("912 345 678");
  await panel.getByRole("button", { name: "Send code" }).click();
  await expect(panel.getByText(/Demo: no message is sent/)).toBeVisible();
  const code = (await panel.getByText(/Your code is/).locator("strong").textContent()) ?? "";
  expect(code).toMatch(/^\d{6}$/);

  await panel.getByLabel("Code").fill("000000" === code ? "111111" : "000000");
  await panel.getByRole("button", { name: "Verify" }).click();
  await expect(panel.getByText(/That code is not right/)).toBeVisible();
  await panel.getByLabel("Code").fill(code);
  await panel.getByRole("button", { name: "Verify" }).click();
  await expect(panel.getByText(/Verified: \+351 9•• ••• 678 · SMS/)).toBeVisible();

  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();
  await expect(page.getByTestId("phone-line")).toContainText("Reminders by SMS to +351 9•• ••• 678");

  // The owner's log: the confirmation went out (to the demo log), and the number is masked.
  const log = await request.get(`/api/owner/restaurants/${venue.id}/messages`, { headers: venue.headers });
  const view = (await log.json()) as { recent: { to: string; kind: string; status: string }[]; usage: { used: number } };
  expect(view.recent).toHaveLength(1);
  expect(view.recent[0]).toMatchObject({ to: "+351 9•• ••• 678", kind: "booking_confirmed", status: "sent" });
  expect(JSON.stringify(view)).not.toContain("912345678");
});

test("a restaurant that sends no phone messages shows no phone block", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "No phone reminders");
  await publishRestaurant(request, venue);
  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await expect(panel.getByLabel("Name for the booking")).toBeVisible();
  await expect(panel.getByRole("region", { name: "Reminders on your phone" })).toHaveCount(0);
});
