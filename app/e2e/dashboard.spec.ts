import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/**
 * ADR-0007 — mobile app shell. On mobile-safari the dashboard must look like the reference app: page title in the
 * app bar (not duplicated in content), a 3-column stats grid, growth chart + quick links above the fold, an
 * app-style bottom bar with an active pill, no horizontal scroll and 0 serious axe violations. Desktop keeps the
 * in-content header and the wide StatCard grid.
 */
test.describe("dashboard shell", () => {
  test("admin dashboard is app-like on mobile / classic on desktop", async ({ page }, testInfo) => {
    await login(page, USERS.admin);
    const mobile = testInfo.project.name === "mobile-safari";
    await expectNoHorizontalScroll(page);

    if (mobile) {
      // Title lives in the app bar; the in-content header is hidden.
      const bar = page.getByTestId("mobile-page-title");
      await expect(bar).toBeVisible();
      await expect(bar).toContainText(/لوحة التحكم|Dashboard/);
      await expect(page.getByTestId("page-header")).toBeHidden();

      // 3-column grid of 6 mini stats, all with real numbers.
      const grid = page.getByTestId("mobile-stats");
      await expect(grid).toBeVisible();
      const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(cols).toBe(3);
      const cards = grid.getByTestId("mini-stat");
      await expect(cards).toHaveCount(6);
      for (const txt of await cards.locator("p").allTextContents()) expect(txt.trim()).toMatch(/^\d/);

      // Growth chart, quick links and recent activity are all above the fold (844px viewport).
      const quick = page.getByTestId("quick-links");
      await expect(quick).toBeVisible();
      const box = await quick.boundingBox();
      expect(box!.y + box!.height).toBeLessThan(844);
      await expect(quick.getByRole("link")).toHaveCount(4);

      // Bottom bar: 5 items, dashboard active.
      const nav = page.getByTestId("bottom-nav");
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: /لوحة التحكم|Dashboard/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.getByRole("button", { name: /المزيد|More/ })).toBeVisible();

      // Quick link navigates and the app bar title follows.
      await quick.getByRole("link", { name: /المقررات|Courses/ }).click();
      await expect(page).toHaveURL(/\/courses/);
      await expect(page.getByTestId("mobile-page-title")).toContainText(/المقررات|Courses/);
      await expectNoHorizontalScroll(page);
    } else {
      await expect(page.getByTestId("page-header")).toBeVisible();
      await expect(page.getByTestId("mobile-overview")).toBeHidden();
      await expect(page.getByTestId("bottom-nav")).toBeHidden();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/لوحة التحكم|Dashboard/);
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking, JSON.stringify(blocking.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual([]);
  });

  test("student sees only permitted stats and quick links", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile-only assertions");
    await login(page, USERS.student);
    const grid = page.getByTestId("mobile-stats");
    const titles = await grid.getByTestId("mini-stat").locator("span[title]").allTextContents();
    expect(titles).not.toContain("المستخدمون");
    expect(titles).toContain("صلاحياتك");
    const links = await page.getByTestId("quick-links").getByRole("link").allTextContents();
    expect(links.join(" ")).not.toMatch(/المستخدمون|Users/);
    await expectNoHorizontalScroll(page);
  });
});
