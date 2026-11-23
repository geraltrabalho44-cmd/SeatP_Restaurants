// The language control is on every Restaurants page and a choice changes the whole site, owner menu and room editor included.
import { demoLinks, expect, test } from "./fixtures";
import { ownerToken } from "./room-session";

const LANGUAGES = {
  pt: { footer: "um projeto de estudantes da Nova SBE", editor: "Editor de salas", menu: "Os meus restaurantes" },
  es: { footer: "un proyecto de estudiantes de Nova SBE", editor: "Editor de salas", menu: "Mis restaurantes" },
  fr: { footer: "un projet d’étudiants de la Nova SBE", editor: "Éditeur de salles", menu: "Mes restaurants" },
} as const;

test("the home page shows the flag and the name of the language, and has no event link", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("button", { name: "Language: English" });
  await expect(picker.locator("svg.flag")).toBeVisible();
  await picker.click();
  await expect(page.locator(".lang-menu [role=option]")).toHaveText(["English", "Português", "Español", "Français"]);
  await expect(page.locator(".lang-menu [role=option] svg.flag")).toHaveCount(4);
  await expect(page.getByRole("link", { name: "Plan an event" })).toHaveCount(0);
});

for (const [code, words] of Object.entries(LANGUAGES)) {
  test(`choosing ${code} translates the diner pages, the owner menu and the room editor, and is remembered`, async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Language: English" }).click();
    await page.locator(`[role=option][lang=${code}]`).click();
    await expect(page.getByText(new RegExp(words.footer))).toBeVisible();

    const links = await demoLinks(request);
    await page.goto(links.restaurant_booking);
    await expect(page.getByText(new RegExp(words.footer))).toBeVisible();
    await expect(page.locator(".lang-trigger span[lang]")).toHaveAttribute("lang", code);

    // The owner menu and the room editor, with the owner's own session.
    await page.addInitScript((value) => window.sessionStorage.setItem("seatplan.session", value), await ownerToken(request));
    await page.goto(`/owner/${links.restaurant_booking.split("/").pop()}/rooms`);
    await expect(page.getByRole("heading", { name: words.editor })).toBeVisible();
    await expect(page.getByText(words.menu, { exact: true })).toBeVisible();
    for (const english of ["My restaurants", "Opening hours", "Floor plan", "Review and publish", "Room editor", "Room properties", "Fit room", "Add room", "Undo", "Redo"]) {
      await expect(page.getByText(english, { exact: true }), english).toHaveCount(0);
    }
  });
}
