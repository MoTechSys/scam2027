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
    // h1 is the tenant name (branding); the login card title is the h2.
    await expect(page.getByRole("heading", { level: 2 })).toContainText(/تسجيل الدخول|Sign in/);
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
    // Exclude Next's empty route announcer (also role=alert).
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(/غير صحيحة|invalid/i);
    await expect(page).toHaveURL(/\/login/);
  });

  // P1-15: the Radix menu is driven via keyboard (Enter on the focused menuitem) — the pointer path was flaky.
  test("logout revokes the session and returns to /login", async ({ page }) => {
    await login(page, USERS.student);
    await page.getByTestId("user-menu").click();
    const item = page.getByRole("menuitem", { name: /تسجيل الخروج|Sign out/ });
    await expect(item).toBeVisible();
    await item.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login\?reason=signed_out/);
    await expect(page.getByText(/تم تسجيل الخروج|signed out/i)).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
