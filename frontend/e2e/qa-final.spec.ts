// Checks added by the final QA pass (2026-11-23): one test for each thing that was wrong and has been fixed.

import { expect, isoDaysFromToday, ORGANISER, signIn, test } from "./fixtures";

test("the 'Add a restaurant' page shows the price as four buttons in one row, with the cuisines as pills, on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ORGANISER, "/owner/new");
  const options = page.locator(".owner-price-option");
  await expect(options).toHaveCount(4);
  const boxes = await options.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, height: r.height };
    }),
  );
  // Same row, left to right, and no button over another.
  for (let i = 1; i < boxes.length; i++) {
    expect(Math.abs(boxes[i].top - boxes[0].top)).toBeLessThan(2);
    expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 1);
  }
  expect(boxes[3].right).toBeLessThanOrEqual(390);
  // The cuisines are pills (rounded boxes), not bare check boxes with text beside them.
  const pill = page.locator(".owner-cuisines .checkbox").first();
  expect(await pill.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
});

test("clearing the date or choosing a day that has passed shows a plain message, never the server's own error text", async ({ page }) => {
  await page.goto(`/restaurants/tasca-do-bairro?date=${isoDaysFromToday(9)}&party=2`);
  const date = page.getByLabel("Date", { exact: true });
  await expect(date).toBeVisible();
  await date.fill("");
  await expect(page.getByText("Choose a date to see the free times.")).toBeVisible();
  await expect(page.getByText(/query\.date|Input should be|We could not load the times/)).toHaveCount(0);
  await date.fill("2020-01-01");
  const go = page.getByRole("button", { name: "See free times" });
  if (await go.count()) await go.click(); // from the first step the diner presses this; from the times step it is not there
  await expect(page.getByRole("heading", { name: "This date has passed" })).toBeVisible();
  await expect(page.getByText("No times left today")).toHaveCount(0);
});

test("the sign-up code screen says where the code is without the word demo", async ({ page }) => {
  await page.goto("/restaurants/account/sign-up");
  await page.getByLabel(/name/i).first().fill("Teresa Antunes");
  await page.getByLabel("Email", { exact: true }).fill("teresa.antunes.qa@example.com");
  await page.getByLabel("Password", { exact: true }).first().fill("a long safe diner password");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText(/No email is sent to an @example\.com address, so your code is \d{6}/)).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/\bdemo\b/i);
});

test("on a phone the things you press on the home page and in the owner's wizard are at least 44 px tall", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("article").first().waitFor();
  const heights = await page.evaluate(() => {
    const tall = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map((el) => el.offsetHeight);
    return {
      search: tall(".discover-search-field input"),
      switch: tall(".discover-view-switch .btn"),
      names: tall(".discover-card h3 a"),
      more: tall(".discover-card .discover-card-more"),
    };
  });
  for (const [what, list] of Object.entries(heights)) {
    expect(list.length, what).toBeGreaterThan(0);
    for (const h of list) expect(h, what).toBeGreaterThanOrEqual(44);
  }
  await signIn(page, ORGANISER, "/owner/new");
  const back = await page.getByRole("link", { name: /My restaurants/ }).first().evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(back).toBeGreaterThanOrEqual(44);
});
