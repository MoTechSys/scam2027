import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/** WCAG 2.1 AA gate — serious/critical violations fail the build. */
async function axe(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, JSON.stringify(blocking.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
}

test.describe("accessibility & responsiveness", () => {
  test("/login passes axe and has no horizontal scroll", async ({ page }) => {
    await page.goto("/login");
    await expectNoHorizontalScroll(page);
    await axe(page);
  });

  test("/developer shows the developer card and passes axe", async ({ page }) => {
    await page.goto("/developer");
    await expect(page.getByText("معين العباسي")).toBeVisible();
    await expect(page.getByRole("link", { name: /alabbasi\.uk/ })).toHaveAttribute("href", /alabbasi\.uk/);
    await expect(page.getByText("+967770941666")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await axe(page);
  });

  test("/dashboard (admin) passes axe and has no horizontal scroll", async ({ page }) => {
    await login(page, USERS.admin);
    await expectNoHorizontalScroll(page);
    await axe(page);
  });

  test("skip link targets #main", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    const href = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href"));
    expect(href).toBe("#main");
  });
});
