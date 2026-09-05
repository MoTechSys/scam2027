import { expect, test, type Page } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/** Codes start with E2E so global-teardown can remove them (order: levels → majors → departments → colleges). */
const stamp = () => Date.now().toString(36).toUpperCase();

/** Desktop rows are <tr>, mobile rows are <li> (MobileDataTable). */
const rowWithText = (page: Page, text: string) => page.locator("tr, li").filter({ hasText: text }).locator("visible=true").first();

async function confirmAlert(page: Page) {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^تأكيد$|^Confirm$/ })
    .click();
}

test.describe("academic structure (P1-04)", () => {
  test("admin sees tabs, current period and seeded structure on every tab", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/academic");
    await expect(page).toHaveURL(/\/academic\/years$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/البنية الأكاديمية|Academic structure/);
    await expect(page.getByTestId("current-period")).toContainText("2026/2027");
    await expect(page.getByTestId("year-card").first()).toBeVisible();
    await expect(page.getByTestId("semester-row")).toHaveCount(2);
    await expectNoHorizontalScroll(page);

    for (const [tab, needle] of [
      ["colleges", "CCIS"],
      ["departments", "CS"],
      ["majors", "CS-BSC"],
      ["levels", "المستوى الأول"],
    ] as const) {
      await page.goto(`/academic/${tab}`);
      await expect(page.getByText(needle, { exact: true }).locator("visible=true").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test("unknown tab → 404; academic admin without year permission still views", async ({ page }) => {
    await login(page, USERS.academic);
    const res = await page.goto("/academic/nope");
    expect(res?.status()).toBe(404);
    await page.goto("/academic/colleges");
    await expect(page.getByText("CCIS", { exact: true }).locator("visible=true").first()).toBeVisible();
  });

  test("admin creates college → department → major → generates levels → deletes bottom-up", async ({ page }) => {
    test.setTimeout(150_000);
    const s = stamp();
    const college = `E2EC${s}`;
    const dept = `E2ED${s}`;
    const major = `E2EM${s}`;
    await login(page, USERS.admin);

    // College
    await page.goto("/academic/colleges");
    await page.getByTestId("create-colleges").click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#c-code").fill(college);
    await dialog.locator("#c-name").fill(`كلية تجريبية ${s}`);
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(college, { exact: true }).locator("visible=true").first()).toBeVisible();

    // Duplicate code → field error, dialog stays open
    await page.getByTestId("create-colleges").click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#c-code").fill(college);
    await dialog.locator("#c-name").fill("تكرار");
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByRole("button", { name: /^إلغاء$|^Cancel$/ }).click();

    // Department under the new college (select by visible label)
    await page.goto("/academic/departments");
    await page.getByTestId("create-departments").click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#d-college").click();
    await page.getByRole("option", { name: new RegExp(college) }).click();
    await dialog.locator("#d-code").fill(dept);
    await dialog.locator("#d-name").fill(`قسم تجريبي ${s}`);
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(dept, { exact: true }).locator("visible=true").first()).toBeVisible();

    // Major
    await page.goto("/academic/majors");
    await page.getByTestId("create-majors").click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#m-dept").click();
    await page.getByRole("option", { name: new RegExp(dept) }).click();
    await dialog.locator("#m-code").fill(major);
    await dialog.locator("#m-name").fill(`تخصص تجريبي ${s}`);
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(major, { exact: true }).locator("visible=true").first()).toBeVisible();

    // Generate 3 levels
    await page.goto("/academic/levels");
    await page.getByTestId("generate-levels").click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#g-major").click();
    await page.getByRole("option", { name: new RegExp(major) }).click();
    await dialog.locator("#g-count").fill("3");
    await dialog.getByRole("button", { name: /^توليد المستويات$|^Generate levels$/ }).click();
    await expect(dialog).toBeHidden();
    // Filter the list by the new major and assert the three generated levels are listed.
    await page.locator("#parent-filter").click();
    await page.getByRole("option", { name: new RegExp(major) }).click();
    await expect(page.getByText(/^3 عنصر|^3 items/)).toBeVisible();
    await expect(page.getByText("المستوى الثالث", { exact: true }).locator("visible=true").first()).toBeVisible();

    // College with dependants cannot be deleted (server guard → error toast, row stays)
    await page.goto("/academic/colleges");
    await rowWithText(page, college).getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await confirmAlert(page);
    await expect(page.getByRole("alertdialog")).toBeVisible(); // stays open on failure
    await page.getByRole("alertdialog").getByRole("button", { name: /^إلغاء$|^Cancel$/ }).click();
    await expect(page.getByText(college, { exact: true }).locator("visible=true").first()).toBeVisible();

    // Delete major (cascades its levels) → department → college
    await page.goto("/academic/majors");
    await rowWithText(page, major).getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await confirmAlert(page);
    await expect(page.getByText(major, { exact: true })).toHaveCount(0);

    await page.goto("/academic/departments");
    await rowWithText(page, dept).getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await confirmAlert(page);
    await expect(page.getByText(dept, { exact: true })).toHaveCount(0);

    await page.goto("/academic/colleges");
    await rowWithText(page, college).getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await confirmAlert(page);
    await expect(page.getByText(college, { exact: true })).toHaveCount(0);
  });

  test("admin adds a year + semester, sets it current, then restores the seeded current semester", async ({ page }) => {
    test.setTimeout(120_000);
    const s = stamp();
    const code = `E2EY-${s}`;
    await login(page, USERS.admin);
    await page.goto("/academic/years");

    await page.getByTestId("create-year").click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#y-code").fill(code);
    await dialog.locator("#y-name").fill(`سنة تجريبية ${s}`);
    await dialog.locator("#y-start").fill("2031-09-01");
    await dialog.locator("#y-end").fill("2032-07-31");
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(dialog).toBeHidden();
    const card = page.getByTestId("year-card").filter({ hasText: code });
    await expect(card).toBeVisible();

    // Add a semester to the new year via its menu
    await card.getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /إضافة فصل|Add semester/ }).click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#s-name").fill(`فصل تجريبي ${s}`);
    await dialog.locator("#s-start").fill("2031-09-01");
    await dialog.locator("#s-end").fill("2032-01-31");
    await dialog.getByRole("button", { name: /^حفظ$|^Save$/ }).click();
    await expect(dialog).toBeHidden();
    const semRow = card.getByTestId("semester-row").filter({ hasText: `فصل تجريبي ${s}` });
    await expect(semRow).toBeVisible();

    // Set current → header card reflects it and year becomes current too
    await semRow.getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /تعيين كالحالي|Set as current/ }).click();
    await confirmAlert(page);
    await expect(page.getByTestId("current-period")).toContainText(`فصل تجريبي ${s}`);
    await expect(card.getByText(/الحالي|Current/).first()).toBeVisible();

    // Restore: make the seeded FIRST semester current again (keeps demo tenant coherent for other specs)
    const seeded = page.getByTestId("year-card").filter({ hasText: "2026/2027" }).getByTestId("semester-row").filter({ hasText: "الفصل الأول" });
    await seeded.getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /تعيين كالحالي|Set as current/ }).click();
    await confirmAlert(page);
    await expect(page.getByTestId("current-period")).toContainText("الفصل الأول");

    // Now the e2e semester is not current → delete it, then delete the empty year
    await semRow.getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await confirmAlert(page);
    await expect(semRow).toHaveCount(0);
    await card.getByRole("button", { name: /إجراءات|Actions/ }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await confirmAlert(page);
    await expect(card).toHaveCount(0);
  });

  test("student sees read-only structure (no create buttons); instructor too", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/academic/colleges");
    await expect(page.getByText("CCIS", { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByTestId("create-colleges")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /إجراءات|Actions/ })).toHaveCount(0);
    await page.goto("/academic/years");
    await expect(page.getByTestId("create-year")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
