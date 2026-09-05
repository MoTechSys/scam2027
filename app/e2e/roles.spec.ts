import { expect, test, type Locator } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/** Expand a permission category (accordion) inside `root` if it is collapsed. */
async function openCategory(root: Locator, key: string) {
  const trigger = root.locator(`[data-category="${key}"] button[aria-expanded]`);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

test.describe("roles module (P1-03)", () => {
  test("admin lists roles, opens a system role (read-only matrix)", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/roles");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/الأدوار|Roles/);
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: "مدرس" }).first().click();
    await expect(page).toHaveURL(/\/roles\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("مدرس");
    await expect(page.getByText("INSTRUCTOR").first()).toBeVisible();
    // System role → no save bar, checkboxes disabled (FR-ROL-005)
    await expect(page.getByRole("button", { name: /حفظ الصلاحيات|Save permissions/ })).toHaveCount(0);
    await expect(page.locator("#perm-dashboard-view")).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });

  test("admin creates a custom role, edits permissions, deletes it to trash", async ({ page }) => {
    test.setTimeout(120_000);
    const code = `E2E_${Date.now().toString(36).toUpperCase()}`;
    await login(page, USERS.admin);
    await page.goto("/roles");
    await page.getByRole("button", { name: /دور جديد|New role/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#r-code").fill(code);
    await dialog.locator("#r-name").fill(`دور تجريبي ${code}`);
    await openCategory(dialog, "file");
    await dialog.locator("#perm-file-view").click();
    await dialog.locator("#perm-file-download").click();
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(page).toHaveURL(/\/roles\/[0-9a-f-]{36}$/);
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByText(/2 صلاحية محددة|2 permissions selected/)).toBeVisible();

    // Edit permissions: add one, save (matrix only shows the first 3 categories expanded)
    await openCategory(page.locator("body"), "file");
    await page.locator("#perm-file-upload").click();
    await page.getByRole("button", { name: /حفظ الصلاحيات|Save permissions/ }).click();
    await expect(page.getByText(/3 صلاحية محددة|3 permissions selected/)).toBeVisible();

    // Delete (no members) → trash
    await page.getByRole("button", { name: /^حذف$|^Delete$/ }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^تأكيد$|^Confirm$/ })
      .click();
    await expect(page).toHaveURL(/tab=DELETED/);
    await expect(page.getByText(code, { exact: true }).locator("visible=true").first()).toBeVisible();
  });

  test("student is redirected away from /roles", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/roles");
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
