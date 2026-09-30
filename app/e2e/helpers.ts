import { expect, type Page } from "@playwright/test";

/** Seeded demo-tenant accounts (prisma/seed.ts). */
export const USERS = {
  admin: { id: "admin@demo.edu", password: "Admin@123456", label: "TENANT_ADMIN" },
  academic: { id: "academic@demo.edu", password: "Academic@123456", label: "ACADEMIC_AFFAIRS" },
  instructor: { id: "EMP-0101", password: "Doctor@123456", label: "INSTRUCTOR" },
  student: { id: "443100001", password: "Student@123456", label: "STUDENT" },
} as const;

export async function login(page: Page, user: { id: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /البريد|Email/i }).fill(user.id);
  await page.locator('input[name="password"]').fill(user.password);
  await page.getByRole("button", { name: /^دخول$|Sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/لوحة التحكم|Dashboard/);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

/** ADR-0008: the app viewport itself never scrolls — only ScrollRegions inside the page do. */
export async function expectNoPageScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow, "app viewport must not scroll vertically (use ScrollRegion)").toBeLessThanOrEqual(1);
}

/**
 * Select a Radix `Select` option robustly on both projects (P1-15). On mobile-safari the pointer tap on
 * `role=option` sometimes lands while the portal listbox is still animating in, so we wait for the option to be
 * stable, click it, and verify by the trigger text; on failure we retry once via keyboard (type-ahead + Enter).
 */
export async function pickOption(page: Page, trigger: string, text: string | RegExp) {
  const trig = page.locator(trigger);
  const matches = (t: string | null) =>
    typeof text === "string" ? (t ?? "").includes(text) : text.test(t ?? "");
  for (let attempt = 0; attempt < 2; attempt++) {
    await trig.click();
    const listbox = page.getByRole("listbox").last();
    await expect(listbox).toBeVisible();
    const option = listbox.getByRole("option", { name: text }).first();
    await expect(option).toBeVisible();
    await page.waitForTimeout(150); // let the open animation settle (zoom-in-95) before the tap
    if (attempt === 0) await option.click();
    else {
      await option.hover();
      await option.focus();
      await page.keyboard.press("Enter");
    }
    await expect(listbox)
      .toBeHidden({ timeout: 5_000 })
      .catch(() => undefined);
    if (matches(await trig.textContent())) return;
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  throw new Error(`pickOption: could not select ${String(text)} in ${trigger}`);
}
