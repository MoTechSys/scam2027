import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

const ACADEMIC_ID_RE = /^\d{4}-\d{5}$/;

test.describe("users module (P1-02)", () => {
  test("admin can list, search and open a user", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/users");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/المستخدمون|Users/);
    await expectNoHorizontalScroll(page);

    const search = page.getByRole("search").getByRole("searchbox");
    await search.fill("EMP-0101");
    await search.press("Enter");
    await expect(page).toHaveURL(/q=EMP-0101/);

    const link = page.getByRole("link", { name: "د. أحمد الحسني" }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("د. أحمد الحسني");
    await expect(page.getByText("EMP-0101")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("admin can create, freeze, delete and see a user in trash", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now().toString(36);
    const name = `E2E ${stamp}`;
    const email = `e2e-${stamp}@demo.edu`;

    await login(page, USERS.admin);
    await page.goto("/users");

    // Create
    await page.getByRole("button", { name: /مستخدم جديد|New user/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("#u-name").fill(name);
    await dialog.locator("#u-email").fill(email);
    await dialog.getByRole("button", { name: /حفظ|Save/ }).click();

    // Temp password reveal
    const code = dialog.locator("code");
    await expect(code).toBeVisible({ timeout: 15_000 });
    const tempPassword = (await code.textContent())?.trim() ?? "";
    expect(tempPassword.length).toBeGreaterThanOrEqual(12);
    await dialog.getByRole("button", { name: /^إغلاق$|^Close$/ }).filter({ hasNot: page.locator("svg") }).click();
    await expect(dialog).toBeHidden();

    // Search for the created user
    const search = page.getByRole("search").getByRole("searchbox");
    await search.fill(email);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const row = page.getByRole("link", { name }).first();
    await expect(row).toBeVisible();

    // Academic ID auto-generated (YYYY-NNNNN)
    const idText = await page.getByText(ACADEMIC_ID_RE).first().textContent();
    expect(idText?.trim()).toMatch(ACADEMIC_ID_RE);

    // Freeze via row actions menu
    const openMenu = async () => {
      await page.getByRole("button", { name: /إجراءات|Actions/ }).filter({ visible: true }).first().click();
    };
    await openMenu();
    await page.getByRole("menuitem", { name: /تجميد|Freeze/ }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /^تأكيد$|^Confirm$/ }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText(/مجمّد|مجمد|Frozen/).first()).toBeVisible({ timeout: 15_000 });

    // Delete
    await openMenu();
    await page.getByRole("menuitem", { name: /حذف|Delete/ }).click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /^تأكيد$|^Confirm$/ }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole("link", { name })).toHaveCount(0, { timeout: 15_000 });

    // Trash tab shows it
    await page.getByRole("button", { name: /سلة المحذوفات|Trash/ }).click();
    await expect(page).toHaveURL(/status=DELETED/);
    await expect(page.getByRole("link", { name }).first()).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });

  test("student is redirected away from /users", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/users");
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
