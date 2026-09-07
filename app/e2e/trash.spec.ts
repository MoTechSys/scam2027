import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, expectNoPageScroll, login } from "./helpers";

/**
 * P1-08 — unified trash. Two E2E-coded courses are soft-deleted straight in the DB (fast + deterministic; the UI
 * delete flow is covered by courses/roles specs). Admin: tabs with badges, search, restore one (it leaves the bin
 * and is live again), permanently delete the other, "empty tab" needs the typed keyword; student → /unauthorized;
 * mobile: no horizontal scroll, no page scroll. Teardown removes anything left with an `E2E` code.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
});

let tenantId = "";
const stamp = Date.now().toString(36).toUpperCase();
const restoreCode = `E2ET${stamp}R`;
const purgeCode = `E2ET${stamp}P`;
const bulkCode = `E2EB${stamp}`;

test.beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: "demo" }, select: { id: true } });
  tenantId = tenant.id;
  await prisma.course.createMany({
    data: [
      {
        tenantId,
        code: restoreCode,
        name: "مقرر للاسترجاع",
        deletedAt: new Date(Date.now() - 2 * 86_400_000),
      },
      { tenantId, code: purgeCode, name: "مقرر للحذف النهائي", deletedAt: new Date() },
    ],
  });
});

test.afterAll(async () => {
  await prisma.course.deleteMany({ where: { tenantId, code: { in: [restoreCode, purgeCode] } } });
  await prisma.$disconnect();
});

async function openCoursesTab(page: Page, q?: string) {
  await page.goto(`/trash?kind=COURSE${q ? `&q=${q}` : ""}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/سلة المحذوفات|Trash/);
  await expect(page.getByRole("tab", { name: /المقررات|Courses/ })).toHaveAttribute("aria-selected", "true");
}

test.describe("trash (P1-08)", () => {
  test("admin restores one course and permanently deletes another", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-safari";
    await login(page, USERS.admin);

    await openCoursesTab(page, `E2ET${stamp}`);
    await expectNoHorizontalScroll(page);
    await expectNoPageScroll(page);
    const rows = page.getByTestId("trash-row").locator("visible=true");
    await expect(rows).toHaveCount(2);
    // Newest deletion first.
    await expect(rows.first()).toContainText(purgeCode);
    await expect(page.getByText(/بعد 30 يوم|in 30 days/).first()).toBeVisible();
    await expect(page.getByTestId("scroll-region").first()).toBeVisible();

    // Restore via row menu.
    const restoreRow = rows.filter({ hasText: restoreCode });
    if (mobile) {
      await restoreRow
        .locator("xpath=ancestor::li")
        .getByRole("button", { name: /إجراءات|Actions/ })
        .click();
      await page.getByRole("menuitem", { name: /استرجاع|Restore/ }).click();
    } else {
      await restoreRow
        .locator("xpath=ancestor::tr")
        .getByRole("button", { name: /إجراءات|Actions/ })
        .click();
      await page.getByTestId("restore").click();
    }
    await expect(page.getByText(/تم استرجاع|Restored/)).toBeVisible();
    await expect(rows).toHaveCount(1);
    // It is live again (deletedAt cleared).
    expect(
      await prisma.course.findFirst({ where: { tenantId, code: restoreCode }, select: { deletedAt: true } }),
    ).toMatchObject({ deletedAt: null });

    // Permanent delete via row menu + confirm.
    await openCoursesTab(page, purgeCode);
    const purgeRow = page.getByTestId("trash-row").locator("visible=true").filter({ hasText: purgeCode });
    await expect(purgeRow).toHaveCount(1);
    if (mobile) {
      await purgeRow
        .locator("xpath=ancestor::li")
        .getByRole("button", { name: /إجراءات|Actions/ })
        .click();
      await page.getByRole("menuitem", { name: /حذف نهائي|Delete permanently/ }).click();
    } else {
      await purgeRow
        .locator("xpath=ancestor::tr")
        .getByRole("button", { name: /إجراءات|Actions/ })
        .click();
      await page.getByTestId("purge").click();
    }
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^تأكيد$|^Confirm$/ })
      .click();
    await expect(page.getByText(/تم الحذف النهائي|Permanently deleted/)).toBeVisible();
    await expect(page.getByTestId("trash-row").locator("visible=true")).toHaveCount(0);
    expect(await prisma.course.count({ where: { tenantId, code: purgeCode } })).toBe(0);
  });

  test("empty-tab needs the typed keyword; bulk select works on desktop", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-safari",
      "checkbox column is desktop-only; mobile covered above",
    );
    await login(page, USERS.admin);
    await prisma.course.create({
      data: { tenantId, code: bulkCode, name: "مقرر تحديد", deletedAt: new Date() },
    });
    await openCoursesTab(page, bulkCode);
    await page.getByTestId("select-all").click();
    await expect(page.getByTestId("bulk-bar")).toContainText(/1 محدّد|1 selected/);

    await page.getByTestId("empty-trash").click();
    const dialog = page.getByRole("alertdialog");
    const submit = dialog.getByTestId("typed-confirm-submit");
    await expect(submit).toBeDisabled();
    await dialog.getByTestId("typed-confirm-input").fill("delete");
    await expect(submit).toBeDisabled();
    await dialog.getByTestId("typed-confirm-input").fill("DELETE");
    await expect(submit).toBeEnabled();
    await dialog.getByRole("button", { name: /^إلغاء$|^Cancel$/ }).click();
    await expect(dialog).toBeHidden();

    // Selection survives the cancelled dialog → bulk restore from the selection bar.
    await page.getByTestId("bulk-restore").click();
    await expect(page.getByText(/تم استرجاع|Restored/)).toBeVisible();
    expect(
      await prisma.course.findFirst({
        where: { tenantId, code: bulkCode },
        select: { deletedAt: true },
      }),
    ).toMatchObject({ deletedAt: null });
    await prisma.course.deleteMany({ where: { tenantId, code: bulkCode } });
  });

  test("student is redirected away from /trash", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/trash");
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
