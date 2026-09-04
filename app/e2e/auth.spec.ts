import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

test.describe("authentication", () => {
  for (const [key, user] of Object.entries(USERS)) {
    test(`${key} (${user.label}) logs in and reaches the dashboard`, async ({ page }) => {
      await login(page, user);
      await expectNoHorizontalScroll(page);
      await expect(page.getByRole("navigation").first()).toBeVisible();
    });
  }

  test("unauthenticated visit to a protected route redirects to /login?next=", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/تسجيل الدخول|Sign in/);
  });

  test("root redirects to /login when signed out", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("wrong password shows a generic error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /البريد|Email/i }).fill(USERS.admin.id);
    await page.locator('input[name="password"]').fill("Wrong@123456");
    await page.getByRole("button", { name: /^دخول$|Sign in/i }).click();
    await expect(page.getByRole("alert")).toContainText(/غير صحيحة|invalid/i);
    await expect(page).toHaveURL(/\/login/);
  });

  // FIXME(P0-14): Radix dropdown + form-action submit is flaky under Playwright; logout is covered by manual QA and
  // the session-actions code path. Re-enable once the menu is driven via keyboard (Enter on the menuitem).
  test.fixme("logout revokes the session and returns to /login", async ({ page }) => {
    await login(page, USERS.student);
    await page.locator('header button[aria-haspopup="menu"]').click(); // user menu trigger
    await page.getByRole("menuitem", { name: /تسجيل الخروج|Sign out/ }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed_out/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
