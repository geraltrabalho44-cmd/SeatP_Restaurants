// Phone reminders, end to end with the real backend and the demo provider (nothing is sent):
// the owner turns SMS on, a diner types a phone number in the form (nothing else to tick or type),
// books, and the owner's log shows the message with the number masked.

import { expect, test } from "./fixtures";
import { dinerMap, holdTable, preparedRestaurant, publishRestaurant } from "./restaurant-fixture";

const SETTINGS = { sms_enabled: true, whatsapp_enabled: false, send_confirmation: true, reminder_24h: true, reminder_3h: true, monthly_cap: 300 };

test("the phone number typed in the form is messaged, and the owner sees the masked message", async ({ page, request }) => {
  const venue = await preparedRestaurant(request, "Phone reminders");
  await publishRestaurant(request, venue);
  const saved = await request.put(`/api/owner/restaurants/${venue.id}/messages`, { headers: venue.headers, data: SETTINGS });
  expect(saved.status(), await saved.text()).toBe(200);

  await dinerMap(page, venue.id, venue.day);
  await holdTable(page, "River 1");
  const panel = page.getByRole("form", { name: "Your details" });
  await panel.getByLabel("Name for the booking").fill("Phone Diner");
  await panel.getByLabel("Email", { exact: true }).fill("phone.diner@example.com");

  // There is no reminders block, no box and no code: the number typed in the form is the one that is messaged.
  await expect(panel.getByRole("region", { name: "Reminders on your phone" })).toHaveCount(0);
  await panel.getByText("Add a phone number or a note for the restaurant").click();
  await panel.getByLabel("Phone (optional)").fill("912 345 678");
  await panel.getByRole("checkbox", { name: /accept the terms/ }).check();

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
