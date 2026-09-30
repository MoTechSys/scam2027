import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, expectNoPageScroll, login } from "./helpers";

/**
 * P1-10 — tenant settings (FR-SET-001/005, FR-TEN-004/007).
 * Admin: general save → audit row; security switches + numeric floor validation; secret set → masked → clear;
 * branding colour → AA contrast gate, then `--primary` on <html>, PNG logo accepted and shown on /login, .exe refused; student → /unauthorized;
 * mobile: no page/horizontal scroll. Everything the suite changes is restored in afterAll (the demo tenant is shared).
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
});

const stamp = Date.now().toString(36).toUpperCase();
let tenantId = "";
let original: { name: string; nameEn: string | null; timezone: string; locale: string } | null = null;
let originalBranding: { primaryColor: string; logoUrl: string | null; loginMessage: string | null } | null =
  null;

// 1×1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeAll(async () => {
  const t = await prisma.tenant.findFirstOrThrow({
    where: { slug: "demo" },
    select: { id: true, name: true, nameEn: true, timezone: true, locale: true, branding: true },
  });
  tenantId = t.id;
  original = { name: t.name, nameEn: t.nameEn, timezone: t.timezone, locale: t.locale };
  originalBranding = t.branding
    ? {
        primaryColor: t.branding.primaryColor,
        logoUrl: t.branding.logoUrl,
        loginMessage: t.branding.loginMessage,
      }
    : null;
});

test.afterAll(async () => {
  if (original) await prisma.tenant.update({ where: { id: tenantId }, data: original });
  if (originalBranding) {
    await prisma.tenantBranding.update({
      where: { tenantId },
      data: { ...originalBranding, logoStorageKey: null, faviconUrl: null },
    });
  }
  await prisma.tenantSetting.deleteMany({
    where: {
      tenantId,
      OR: [
        { category: "email", key: "smtpPassword" },
        { category: "general", key: "supportEmail" },
      ],
    },
  });
  await prisma.$disconnect();
});

test.describe("settings — admin", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin);
  });

  test("/settings redirects to general; tabs exist; one h1", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/general$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByTestId("general-form")).toBeVisible();
    await expectNoPageScroll(page);
    await expectNoHorizontalScroll(page);
  });

  test("general: save name + support email → persisted, audited, reflected after reload", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const form = page.getByTestId("general-form");
    await form.locator('input[name="nameEn"]').fill(`Demo University ${stamp}`);
    await form.locator('input[name="supportEmail"]').fill(`help-${stamp.toLowerCase()}@demo.edu`);
    await form.getByTestId("settings-save").click();
    await expect(page.getByText(/تم حفظ الإعدادات|Settings saved/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("general-form").locator('input[name="nameEn"]')).toHaveValue(
      `Demo University ${stamp}`,
    );
    const row = await prisma.tenantSetting.findFirst({
      where: { tenantId, category: "general", key: "supportEmail" },
    });
    expect(row?.value).toBe(`help-${stamp.toLowerCase()}@demo.edu`);
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "settings.update_general" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.after)).toContain(stamp);
  });

  test("general: invalid support email is rejected inline", async ({ page }) => {
    await page.goto("/settings/general");
    const form = page.getByTestId("general-form");
    await form.locator('input[name="supportEmail"]').fill("not-an-email");
    await form.getByTestId("settings-save").click();
    await expect(form.locator('[id="supportEmail-error"], [role="alert"]').first()).toBeVisible();
    const row = await prisma.tenantSetting.findFirst({
      where: { tenantId, category: "general", key: "supportEmail" },
    });
    expect(row?.value).not.toBe("not-an-email");
  });

  test("security: password floor enforced; toggles persist", async ({ page }) => {
    await page.goto("/settings/security");
    const form = page.getByTestId("security-form");
    await form.locator('input[name="passwordMinLength"]').fill("4");
    await form.getByTestId("settings-save").first().click();
    await expect(form.locator('[role="alert"]').first()).toBeVisible();

    await form.locator('input[name="passwordMinLength"]').fill("12");
    const sym = form.getByTestId("require-symbol");
    const before = (await sym.getAttribute("aria-checked")) === "true";
    await sym.click();
    await form.getByTestId("settings-save").first().click();
    await expect(page.getByText(/تم حفظ الإعدادات|Settings saved/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("security-form").getByTestId("require-symbol")).toHaveAttribute(
      "aria-checked",
      String(!before),
    );
    const row = await prisma.tenantSetting.findFirst({
      where: { tenantId, category: "security", key: "passwordRequireSymbol" },
    });
    expect(row?.value).toBe(!before);
    // restore
    await page.getByTestId("security-form").getByTestId("require-symbol").click();
    await page.getByTestId("security-form").getByTestId("settings-save").first().click();
    await expect(page.getByText(/تم حفظ الإعدادات|Settings saved/)).toBeVisible();
  });

  test("security: secret is stored encrypted, shown masked, clearable", async ({ page }) => {
    await page.goto("/settings/security");
    const sf = page.getByTestId("secret-form");
    await sf.getByTestId("secret-input").fill(`smtp-pass-${stamp}-WXYZ`);
    await sf.getByTestId("secret-save").click();
    await expect(sf.getByTestId("secret-state")).toContainText("WXYZ");
    await expect(sf.getByTestId("secret-state")).not.toContainText("smtp-pass");
    const raw = await prisma.tenantSetting.findFirstOrThrow({
      where: { tenantId, category: "email", key: "smtpPassword" },
    });
    expect(raw.isSecret).toBe(true);
    expect(String(raw.value).startsWith("v1:")).toBe(true);
    expect(JSON.stringify(raw.value)).not.toContain("smtp-pass");
    await sf.getByTestId("secret-clear").click();
    await expect(sf.getByTestId("secret-state")).toContainText(/غير مضبوط|Not set/);
  });

  test("branding: low-contrast colour refused; AA colour applies to <html> --primary; PNG logo accepted and shown on /login; .exe refused", async ({
    page,
  }) => {
    await page.goto("/settings/branding");
    const form = page.getByTestId("branding-form");

    // WCAG AA gate: #1e90ff reads 3.95:1 on the tinted accent surface → live warning + server rejection
    await form.locator('input[name="primaryColor"]').fill("#1e90ff");
    await expect(form.getByTestId("contrast-readout")).toHaveAttribute("data-passes", "false");
    await form.getByTestId("settings-save").click();
    await expect(form.locator('[role="alert"]').first()).toBeVisible();
    const unchanged = await prisma.tenantBranding.findUniqueOrThrow({ where: { tenantId } });
    expect(unchanged.primaryColor.toLowerCase()).not.toBe("#1e90ff");

    // AA-passing colour is accepted and injected on <html>
    await form.locator('input[name="primaryColor"]').fill("#38bdf8");
    await expect(form.getByTestId("contrast-readout")).toHaveAttribute("data-passes", "true");
    await form.locator('textarea[name="loginMessage"]').fill(`أهلًا ${stamp}`);
    await form.getByTestId("settings-save").click();
    await expect(page.getByText(/تم حفظ الإعدادات|Settings saved/)).toBeVisible();
    await page.reload();
    const primary = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--primary").trim(),
    );
    expect(primary.toLowerCase()).toBe("#38bdf8");

    // Logo upload — PNG accepted
    await page
      .getByTestId("logo-input")
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText(/تم حفظ الشعار|Logo saved/)).toBeVisible();
    await expect(page.getByTestId("logo-preview")).toBeVisible();
    const b = await prisma.tenantBranding.findUniqueOrThrow({ where: { tenantId } });
    expect(b.logoUrl).toMatch(new RegExp(`^/api/branding/logo/${tenantId}/`));
    expect(b.logoStorageKey).toMatch(new RegExp(`^${tenantId}/branding/`));
    // Public GET serves it with a locked-down CSP
    const res = await page.request.get(b.logoUrl!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    expect(res.headers()["content-security-policy"]).toContain("sandbox");

    // Disguised executable refused (magic bytes, not extension)
    const exe = await page.request.post("/api/branding/logo", {
      multipart: {
        logo: { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("MZ\x90\x00garbage") },
      },
    });
    expect(exe.status()).toBeGreaterThanOrEqual(400);
    expect(exe.status()).toBeLessThan(500);

    // Login page reflects branding
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByText(`أهلًا ${stamp}`)).toBeVisible();
    await expect(page.locator(`img[src^="/api/branding/logo/${tenantId}/"]`).first()).toBeVisible();
  });

  test("mobile: every tab fits the viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile-only");
    for (const tab of ["general", "security", "branding"]) {
      await page.goto(`/settings/${tab}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expectNoPageScroll(page);
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe("settings — access", () => {
  test("student is redirected to /unauthorized; anonymous API upload → 401", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/settings/general");
    await expect(page).toHaveURL(/\/unauthorized/);
    await page.context().clearCookies();
    const res = await page.request.post("/api/branding/logo", {
      multipart: { logo: { name: "x.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(res.status()).toBe(401);
  });
});
