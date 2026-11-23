// The browser's Back button goes back one booking step, and only then to the page the diner came from.
import { demoLinks, expect, isoDaysFromToday, test } from "./fixtures";

test("Back in the browser goes back one step of the booking at a time", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto("/");
  await page.goto(`${links.restaurant_booking}?date=${isoDaysFromToday(2)}&party=2`);
  await page.getByRole("button", { name: "See free times" }).click();
  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  await page.getByRole("button", { name: /^\d\d:\d\d Available$/ }).first().click();
  await page.getByRole("button", { name: /^Choose a table at/ }).click();
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();

  await page.getByRole("button", { name: "Choose for me" }).click();
  await expect(page.getByRole("form", { name: "Your details" })).toBeVisible(); // a table is held

  await page.goBack(); // the held table is given back, the diner is on the plan again
  await expect(page.getByRole("heading", { name: "Choose your table" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Your details" })).toHaveCount(0);

  await page.goBack(); // one step back: the times
  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();

  await page.goBack(); // and one more: the date and the party
  await expect(page.getByRole("button", { name: "See free times" })).toBeVisible();

  await page.goBack(); // only now the page the diner came from
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
});

test("after the booking is confirmed one Back leaves the booking", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto("/");
  await page.goto(`${links.restaurant_booking}?date=${isoDaysFromToday(2)}&party=2`);
  await page.getByRole("button", { name: "See free times" }).click();
  await page.getByRole("button", { name: /^\d\d:\d\d Available$/ }).first().click();
  await page.getByRole("button", { name: /^Choose a table at/ }).click();
  await page.getByRole("button", { name: "Choose for me" }).click();
  await page.getByLabel("Name for the booking").fill("Back Diner");
  await page.getByLabel("Email", { exact: true }).fill("back.diner@example.com");
  await page.getByRole("checkbox", { name: /accept the terms/ }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed." })).toBeVisible();

  await page.goBack(); // one press is enough: the steps of a finished booking are skipped
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
});
