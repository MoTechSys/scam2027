import { expect, test, type Page } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login, pickOption } from "./helpers";

/**
 * P1-05 part 2 — sections (offerings), roster and enrolment.
 * Admin: course → section → open → enrol → withdraw. Instructor/student: own scope only. Mobile: no horizontal scroll.
 * All created rows use the E2E* course code so global teardown removes them (enrollments → offerings → courses).
 */
const save = (page: Page, form: string, label: RegExp = /حفظ|Save/) =>
  page.getByTestId(form).getByRole("button", { name: label }).click();

test.describe("offerings", () => {
  test("admin creates a section, opens it, enrols a student and withdraws them", async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-safari"; // P1-15: runs on both projects
    test.setTimeout(120_000);
    await login(page, USERS.admin);

    // 1. course (E2E-prefixed so teardown cleans it and its sections)
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await page.goto("/courses");
    await page.getByTestId("create-course").click();
    await page.locator("#crs-code").fill(code);
    await page.locator("#crs-name").fill("مقرر شُعب آلي");
    await save(page, "course-form");
    await expect(page.getByTestId("course-form")).toBeHidden();

    // 2. section — status DRAFT by default, capacity empty (= unlimited), one instructor
    await page.goto("/offerings?new=1");
    await expect(page.getByTestId("offering-form")).toBeVisible();
    await pickOption(page, "#off-course", new RegExp(code));
    await page.locator("#off-section").fill("E1");
    await page.getByTestId("add-instructor").click();
    await pickOption(page, "#ins-user-0", /أحمد|Ahmad/);
    await save(page, "offering-form");
    await expect(page.getByTestId("offering-form")).toBeHidden();

    await page.goto(`/offerings?q=${code}`);
    // Desktop table and mobile list are both in the DOM — match the visible one (AGENTS #8).
    const row = page.getByTestId("offering-link").filter({ hasText: code }).locator("visible=true").first();
    await expect(row).toBeVisible();
    await expect(
      page
        .getByText(/مسودة|Draft/)
        .locator("visible=true")
        .first(),
    ).toBeVisible();

    // 3. DRAFT → OPEN through the status dialog (desktop: row menu button; mobile: list actions menu)
    if (mobile) {
      await page
        .getByRole("button", { name: /إجراءات|Actions/ })
        .locator("visible=true")
        .first()
        .click();
    } else {
      await page.getByRole("button", { name: new RegExp(`${code} E1`) }).click();
    }
    await page.getByRole("menuitem", { name: /تغيير حالة الشعبة|Change section status/ }).click();
    await expect(page.locator("#off-next")).toBeVisible(); // first allowed transition (OPEN) preselected
    await page
      .getByRole("button", { name: /فتح التسجيل|Open enrolment/ })
      .last()
      .click();
    await expect(page.locator("#off-next")).toBeHidden();
    await expect(
      page
        .getByText(/مفتوحة|Open/)
        .locator("visible=true")
        .first(),
    ).toBeVisible();

    // 4. detail + roster: enrol student 30 (search by academic id), then withdraw
    await row.click();
    await expect(page).toHaveURL(/\/offerings\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
    await expectNoHorizontalScroll(page);
    await page.getByTestId("enroll-student").click();
    await page.locator("#enr-student").fill("443100030");
    await page.getByTestId("student-candidate").first().click();
    await save(page, "enroll-form", /تسجيل طالب|Enrol student/);
    await expect(page.getByTestId("enroll-form")).toBeHidden();
    await expect(page.getByText("443100030").locator("visible=true").first()).toBeVisible();

    await page
      .getByRole("button", { name: /إجراءات|Actions/ })
      .locator("visible=true")
      .first()
      .click();
    await page.getByRole("menuitem", { name: /انسحاب|Withdraw/ }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /^تأكيد$|^Confirm$/ }).click();
    await expect(confirm).toBeHidden();
    await page.goto(`${page.url().split("?")[0]}?status=WITHDRAWN`);
    await expect(page.getByText("443100030").locator("visible=true").first()).toBeVisible();
  });

  test("admin bulk-enrols by identifiers and sees the per-line result", async ({ page }, testInfo) => {
    void testInfo; // P1-15: runs on both projects
    await login(page, USERS.admin);
    await page.goto("/offerings?q=IS101");
    await page.getByTestId("offering-link").locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/offerings\/[0-9a-f-]{36}$/);
    await page.getByTestId("bulk-enroll").click();
    // IS101/1 is seeded with students 1..8 → student1 = ALREADY; unknown email = NOT_FOUND (no data mutated)
    await page.locator("#enr-ids").fill("443100001\nnobody@nowhere.invalid");
    await save(page, "bulk-form", /تسجيل جماعي|Bulk enrol/);
    const result = page.getByTestId("bulk-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText(/مسجّل مسبقًا|Already/);
    await expect(result).toContainText(/غير موجود|Not found/);
  });

  test("instructor sees only own sections and cannot create", async ({ page }) => {
    await login(page, USERS.instructor);
    await page.goto("/offerings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/شُعبي|My sections/);
    await expect(page.getByTestId("create-offering")).toHaveCount(0);
    await expect(page.locator("#off-mine")).toHaveCount(0);
    await expect(page.getByTestId("offering-link").locator("visible=true").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByTestId("offering-link").locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/offerings\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("bulk-enroll")).toBeVisible(); // instructor may enrol into own section
    await expectNoHorizontalScroll(page);
  });

  test("student sees enrolled sections only, without roster tools", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/offerings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/شُعبي|My sections/);
    await expect(page.getByTestId("create-offering")).toHaveCount(0);
    await expect(page.getByTestId("offering-link").locator("visible=true").first()).toBeVisible();
    await page.getByTestId("offering-link").locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/offerings\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("enroll-student")).toHaveCount(0);
    await expect(page.getByTestId("bulk-enroll")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("admin list has no horizontal scroll on mobile", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/offerings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
