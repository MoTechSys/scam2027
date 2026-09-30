import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, expectNoPageScroll, login } from "./helpers";

/**
 * P1-13 — reports (FR-RPT-001/002/003/006). Admin: 4 tabs render real numbers that match the DB, every chart draws
 * an SVG, filters are URL-addressable and change the numbers, CSV export matches the filters (BOM + header + rows
 * header) and is audited; instructor: tabs narrowed (no users tab) with the scope note; student → /unauthorized and
 * export 403; both viewports: exactly one h1, no page/horizontal scroll.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
});

let tenantId = "";
let counts = { users: 0, courses: 0, files: 0, students: 0 };

test.beforeAll(async () => {
  tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "demo" }, select: { id: true } })).id;
  const [users, courses, files, students] = await Promise.all([
    prisma.user.count({ where: { tenantId, deletedAt: null } }),
    prisma.course.count({ where: { tenantId, deletedAt: null } }),
    prisma.file.count({ where: { tenantId, deletedAt: null } }),
    prisma.userRole.count({ where: { tenantId, role: { code: "STUDENT" }, user: { deletedAt: null } } }),
  ]);
  counts = { users, courses, files, students };
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("reports (P1-13)", () => {
  test("admin sees all four tabs with real numbers, charts, filters and CSV export", async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-safari";
    await login(page, USERS.admin);

    // /reports → overview
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/reports\/overview/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/التقارير|Reports/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expectNoHorizontalScroll(page);
    await expectNoPageScroll(page);
    const kpis = page.getByTestId("report-kpi");
    await expect(kpis).toHaveCount(8);
    await expect(kpis.first()).toContainText(String(counts.users)); // users KPI = live count
    await expect(page.locator("[data-testid^=chart-] svg.recharts-surface")).toHaveCount(4);
    await expect(page.getByTestId("report-scope")).toHaveCount(0); // tenant-wide → no scope note

    // users tab: KPI total, role filter narrows to students
    await page.getByRole("tab", { name: /المستخدمون|Users/ }).click();
    await expect(page).toHaveURL(/\/reports\/users$/);
    await expect(page.getByTestId("report-kpi").first()).toContainText(String(counts.users));
    await expect(page.locator("[data-testid^=chart-] svg.recharts-surface")).toHaveCount(4);
    if (!mobile) {
      await page.getByTestId("rf-role").click();
      await page.getByRole("option", { name: /^طالب$|^Student$/ }).click();
      await expect(page).toHaveURL(/roleId=/);
      await expect(page.getByTestId("report-kpi").first()).toContainText(String(counts.students));
      const href = await page.getByTestId("report-export").getAttribute("href");
      expect(href).toMatch(/^\/api\/reports\/users\/export\?roleId=/);
    }
    await expectNoPageScroll(page);

    // courses tab: current semester label, table, top-courses chart
    await page.goto("/reports/courses");
    await expect(page.getByTestId("report-semester")).toBeVisible();
    await expect(page.getByTestId("report-kpi").first()).toContainText(String(counts.courses));
    await expect(page.getByText("CS101").locator("visible=true").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoPageScroll(page);

    // files tab: date filter is URL-addressable and narrows to zero
    await page.goto("/reports/files");
    await expect(page.getByTestId("report-kpi").first()).toContainText(String(counts.files));
    await expect(
      page.getByTestId("top-downloads").or(page.getByText(/لا تنزيلات بعد|No downloads yet/)),
    ).toBeVisible();
    await page.goto("/reports/files?from=2000-01-01&to=2000-01-31");
    await expect(page.getByTestId("report-kpi").first()).toContainText(/^\D*0\D*$/);
    await expectNoPageScroll(page);

    // export: filters carried 1:1, BOM + header + rows header; strict contract; audited
    await page.goto("/reports/files");
    const href = await page.getByTestId("report-export").getAttribute("href");
    expect(href).toBe("/api/reports/files/export");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="report-files-.*\.csv"/);
    expect(res.headers()["x-report-rows"]).toBe(String(counts.files));
    const body = await res.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split("\r\n").filter(Boolean);
    expect(lines[0]).toBe(
      "name,category,status,mimeType,sizeBytes,course,offering,uploader,downloads,createdAt",
    );
    expect(lines).toHaveLength(counts.files + 1);
    const users = await page.request.get("/api/reports/users/export?status=ACTIVE");
    expect(users.status()).toBe(200);
    expect((await users.text()).split("\r\n")[0]?.slice(1)).toBe(
      "academicId,name,email,status,roles,lastLoginAt,createdAt",
    );
    expect((await page.request.get("/api/reports/users/export?page=2")).status()).toBe(400);
    expect((await page.request.get("/api/reports/nope/export")).status()).toBe(404);
    await page.goto("/reports/courses");
    await page.getByTestId("report-export").getAttribute("href");
    const csv = await page.request.get("/api/reports/courses/export");
    expect(csv.headers()["x-report-rows"]).toBe(String(counts.courses));
    await page.goto("/audit?action=report.export");
    await expect(
      page.locator("main").getByText("report.export").locator("visible=true").first(),
    ).toBeVisible();
  });

  test("instructor sees only scoped tabs with the scope note; unknown tab → 404", async ({ page }) => {
    await login(page, USERS.instructor);
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/reports\/overview/);
    await expect(page.getByRole("tab")).toHaveCount(3); // no users tab (report.users not granted)
    await expect(page.getByTestId("report-scope")).toBeVisible();
    await page.goto("/reports/users");
    await expect(page).toHaveURL(/\/unauthorized/);
    await page.goto("/reports/courses");
    await expect(page.getByTestId("report-scope")).toBeVisible();
    await expect(page.getByText("CS101").locator("visible=true").first()).toBeVisible();
    const res = await page.request.get("/api/reports/courses/export");
    expect(res.status()).toBe(200); // report.export (own) → scoped rows
    expect(Number(res.headers()["x-report-rows"])).toBeLessThan(counts.courses);
    expect((await page.request.get("/api/reports/users/export")).status()).toBe(403);
    const nf = await page.goto("/reports/whatever");
    expect(nf?.status()).toBe(404);
  });

  test("student is redirected away and cannot export", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/unauthorized/);
    expect((await page.request.get("/api/reports/files/export")).status()).toBe(403);
  });
});
