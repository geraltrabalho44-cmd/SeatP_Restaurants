// Natural-language search and the weather panel, with the real backend and the demo forecast
// (simulated weather: no account, no network).

import { demoLinks, expect, isoDaysFromToday, test } from "./fixtures";

test("typing a sentence is understood, shown as chips, and a chip can be taken back out", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Restaurant or cuisine" });
  await search.fill("sushi para 4 sabado");
  const chips = page.getByLabel("Search interpretation");
  await expect(chips).toBeVisible();
  await expect(chips.getByRole("button", { name: /para 4/ })).toBeVisible();
  await chips.getByRole("button", { name: /para 4/ }).click();
  await expect(search).not.toHaveValue(/para 4/);
  await expect(search).toHaveValue(/sushi/);
});

test("the booking page shows the day's simulated weather and the sunset", async ({ page, request }) => {
  const links = await demoLinks(request);
  await page.goto(`${links.showcase_tagus_terrace}?date=${isoDaysFromToday(3)}&party=2`);
  await page.getByRole("button", { name: "See free times" }).click();
  const panel = page.getByRole("region", { name: "Weather and sunset" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Simulated weather (demo)");
  await expect(panel).toContainText(/Sunset at \d\d:\d\d/);
});
