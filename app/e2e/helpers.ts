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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}
