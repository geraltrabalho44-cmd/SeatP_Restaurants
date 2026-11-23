// The SeatPlan logo brings the visitor back to the home page as on arriving: no place, search or filters kept.
import { expect, test } from "./fixtures";

test("the logo opens the home page with nothing chosen", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose a city").first().selectOption({ label: "Lisboa" });
  await expect(page.getByRole("heading", { name: /restaurants? near Lisbon/ })).toBeVisible();
  await page.getByRole("link", { name: "SeatPlan Restaurantes, home" }).click();
  await expect(page.getByLabel("Choose a city").first()).toHaveValue("");
  await expect(page.getByRole("heading", { name: /^\d+ restaurants?$/ })).toBeVisible();
  // Going back to a restaurant and returning still keeps what was chosen after the logo click.
  await page.getByLabel("Choose a city").first().selectOption({ label: "Lisboa" });
  await page.getByRole("article").first().getByRole("link").first().click();
  await page.goBack();
  await expect(page.getByLabel("Choose a city").first()).toHaveValue("Lisboa");
});
