import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, expectNoPageScroll, login } from "./helpers";

/**
 * P1-09 — audit log (UC-SYS-002). Two rows are inserted straight into AuditLog with a per-run stamp in `entityId`
 * (desktop and mobile runs share the DB). Admin: list, free-text search, filter panel, details sheet with a
 * before/after diff, CSV export (BOM + header + injection-safe cell); student → /unauthorized; the export route
 * refuses a session without `audit.export`; mobile: no horizontal scroll, no page scroll.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
});

const stamp = `E2EA${Date.now().toString(36).toUpperCase()}`;
let tenantId = "";

test.beforeAll(async () => {
  tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "demo" }, select: { id: true } })).id;
  const admin = await prisma.user.findFirstOrThrow({
    where: { tenantId, email: "admin@demo.edu" },
    select: { id: true },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId,
        actorId: admin.id,
        action: "user.edit",
        entity: "User",
        entityId: `${stamp}-EDIT`,
        before: { name: "قبل", phone: "0500000000", status: "ACTIVE" },
        after: { name: "بعد", status: "ACTIVE", email: "=cmd|' /C calc'!A0" }, // CSV-injection probe
        ip: "10.9.9.9",
        requestId: `${stamp}-req`,
      },
      {
        tenantId,
        actorId: null,
        action: "trash.purge_auto",
        entity: "Trash",
        entityId: `${stamp}-SYS`,
        after: { purged: 1 },
      },
    ],
  });
});

test.afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId, entityId: { startsWith: stamp } } });
  await prisma.$disconnect();
});

test.describe("audit log (P1-09)", () => {
  test("admin searches, filters, opens the diff sheet and exports CSV", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-safari";
    await login(page, USERS.admin);

    await page.goto(`/audit?q=${stamp}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/سجل التدقيق|Audit log/);
    await expectNoHorizontalScroll(page);
    await expectNoPageScroll(page);
    await expect(page.getByTestId("audit-total")).toContainText(/2|سجلان|entries/);

    // System actor is rendered as such; human actor by name.
    const main = page.locator("main");
    await expect(
      main
        .getByText(/^النظام$|^System$/)
        .locator("visible=true")
        .first(),
    ).toBeVisible();
    await expect(main.getByText("عبدالله المدير").locator("visible=true").first()).toBeVisible();

    // Filter panel → system only.
    await page.getByTestId("audit-toggle-filters").click();
    await expect(page.getByTestId("audit-filters")).toBeVisible();
    if (!mobile) {
      await page
        .getByRole("combobox", { name: /الفاعل|Actor/ })
        .first()
        .click();
      await page.getByRole("option", { name: /^النظام$|^System$/ }).click();
      await expect(page).toHaveURL(/actorKind=SYSTEM/);
      await expect(page.getByTestId("audit-total")).toContainText(/1|سجل واحد|1 entry/);
      await page.getByTestId("audit-clear").click();
      await expect(page).not.toHaveURL(/actorKind/);
    }

    // Details sheet with diff.
    await page.goto(`/audit?q=${stamp}-EDIT`);
    const view = page.getByTestId("audit-view").locator("visible=true").first();
    if (mobile)
      await page.getByText(`${stamp}-EDIT`).locator("visible=true").first().click(); // row tap opens the sheet
    else await view.click();
    const sheet = page.getByTestId("audit-entry-sheet");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/entry=/);
    const diff = sheet.getByTestId("audit-diff");
    await expect(diff.locator('[data-kind="changed"]')).toHaveCount(1); // name
    await expect(diff.locator('[data-kind="removed"]')).toHaveCount(1); // phone
    await expect(diff.locator('[data-kind="added"]')).toHaveCount(1); // email
    await expect(diff.locator('[data-kind="same"]')).toHaveCount(0); // hidden by "changes only"
    await sheet.getByRole("switch").click();
    await expect(diff.locator('[data-kind="same"]')).toHaveCount(1); // status
    await expect(sheet).toContainText("10.9.9.9");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/entry=/);

    // Export: same filters, BOM + header, injection-safe cell, audited.
    const href = await page.getByTestId("audit-export").getAttribute("href");
    expect(href).toContain(`/api/audit/export?q=${stamp}-EDIT`);
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="audit-log-.*\.csv"/);
    expect(res.headers()["x-audit-rows"]).toBe("1");
    const body = await res.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split("\r\n").filter(Boolean);
    expect(lines[0]).toBe(
      "createdAt,action,entity,entityId,actorId,actorName,actorEmail,ip,requestId,before,after",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`user.edit,User,${stamp}-EDIT`);
    expect(lines[1]).toContain("عبدالله المدير");
    expect(lines[1]).not.toMatch(/,=cmd/); // formula prefix neutralised inside the JSON cell
    // Strict contract: unknown params are rejected.
    expect((await page.request.get("/api/audit/export?page=2")).status()).toBe(400);
    // The export itself left a trail.
    await page.goto("/audit?action=audit.export");
    await expect(
      page.locator("main").getByText("audit.export").locator("visible=true").first(),
    ).toBeVisible();
  });

  test("student is redirected away and cannot export", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/audit");
    await expect(page).toHaveURL(/\/unauthorized/);
    expect((await page.request.get("/api/audit/export")).status()).toBe(403);
  });
});
