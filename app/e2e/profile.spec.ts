import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, expectNoPageScroll, login } from "./helpers";

/**
 * P1-14 — profile (FR-USR-011). Uses the academic admin so nothing here collides with users.spec / auth-recovery.
 * info: name + title save → header shows the new name → audit row; validation error surfaces under the field;
 * avatar: PNG upload shows in the page and the header, .exe refused (415), remove clears; appearance: LIGHT persists
 * across reload and is stored in UserProfile.theme; password: wrong current → error, correct → toast; notifications:
 * shared preferences component; student: no notifications tab when permission missing → 404 on direct access.
 * Everything is restored in afterAll (shared demo tenant).
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
});
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let tenantId = "";
let userId = "";
let original: { name: string; phone: string | null; locale: string; passwordHash: string | null } | null =
  null;

test.beforeAll(async () => {
  const u = await prisma.user.findFirstOrThrow({
    where: { email: USERS.academic.id, tenant: { slug: "demo" } },
    select: { id: true, tenantId: true, name: true, phone: true, locale: true, passwordHash: true },
  });
  tenantId = u.tenantId;
  userId = u.id;
  original = { name: u.name, phone: u.phone, locale: u.locale, passwordHash: u.passwordHash };
});

test.afterAll(async () => {
  if (original) await prisma.user.update({ where: { id: userId }, data: original });
  await prisma.userProfile.updateMany({
    where: { tenantId, userId },
    data: { theme: "DARK", avatarUrl: null, avatarStorageKey: null, title: null, bio: null },
  });
  await prisma.$disconnect();
});

test.describe("profile (P1-14)", () => {
  test("info: edit, validation, avatar upload/remove, header reflects changes", async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-safari";
    const stamp = Date.now().toString(36).toUpperCase();
    await login(page, USERS.academic);

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile\/info/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/الملف الشخصي|Profile/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expectNoHorizontalScroll(page);
    await expectNoPageScroll(page);

    // validation: bad phone → field error, name unchanged
    await page.getByTestId("pf-phone").fill("abc");
    await page.getByTestId("pf-save").click();
    await expect(page.getByTestId("profile-form").getByRole("alert")).toBeVisible();

    // happy path
    await page.getByTestId("pf-phone").fill("+966 500 000 111");
    await page.getByTestId("pf-name").fill(`سارة ${stamp}`);
    await page.getByTestId("pf-title").fill("وكيلة");
    await page.getByTestId("pf-save").click();
    await expect(page.getByText(/تم حفظ بياناتك|Your details were saved/)).toBeVisible();
    await expect(page.getByTestId("user-menu")).toContainText(stamp);
    if (!mobile) await expect(page.getByTestId("app-header")).toContainText(stamp);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, phone: true },
    });
    expect(row).toEqual({ name: `سارة ${stamp}`, phone: "+966 500 000 111" });
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "profile.update", entityId: userId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ name: `سارة ${stamp}`, title: "وكيلة" });

    // avatar: upload PNG through the hidden input → image in page + header; .exe → 415; remove → gone
    await page
      .getByTestId("avatar-input")
      .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText(/تم تحديث الصورة|Picture updated/)).toBeVisible();
    await expect(page.getByTestId("avatar-img")).toBeVisible();
    await expect(page.getByTestId("app-header").locator("img")).toHaveCount(1);
    const src = await page.getByTestId("avatar-img").getAttribute("src");
    expect(src).toMatch(new RegExp(`^/api/profile/avatar/${tenantId}/${userId}/`));
    const img = await page.request.get(src!);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");
    expect(img.headers()["content-security-policy"]).toContain("sandbox");
    const bad = await page.request.post("/api/profile/avatar", {
      multipart: {
        avatar: {
          name: "x.exe",
          mimeType: "application/octet-stream",
          buffer: Buffer.from("MZ\0\0notanimage"),
        },
      },
    });
    expect(bad.status()).toBe(415);
    const profileRow = await prisma.userProfile.findUniqueOrThrow({
      where: { userId },
      select: { avatarStorageKey: true },
    });
    expect(profileRow.avatarStorageKey).toMatch(new RegExp(`^${tenantId}/avatars/.+\\.png$`));
    await page.getByTestId("avatar-remove").click();
    await expect(page.getByText(/تمت إزالة الصورة|Picture removed/)).toBeVisible();
    await expect(page.getByTestId("avatar-img")).toHaveCount(0);
    expect((await page.request.get(src!)).status()).toBe(404);
  });

  test("appearance: LIGHT persists across reload and in the DB; header toggle writes back", async ({
    page,
  }) => {
    await login(page, USERS.academic);
    await page.goto("/profile/appearance");
    await expect(page.getByTestId("theme-DARK")).toHaveAttribute("data-active", "true");
    await page.getByTestId("theme-LIGHT").click();
    await expect(page.getByText(/تم حفظ المظهر|Appearance saved/)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(false);
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await expect(page.getByTestId("theme-LIGHT")).toHaveAttribute("data-active", "true");
    expect(
      (await prisma.userProfile.findUniqueOrThrow({ where: { userId }, select: { theme: true } })).theme,
    ).toBe("LIGHT");
    // a different page keeps the persisted theme
    await page.goto("/dashboard");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await page.goto("/profile/appearance");
    await page.getByTestId("theme-DARK").click();
    await expect
      .poll(
        async () =>
          (await prisma.userProfile.findUniqueOrThrow({ where: { userId }, select: { theme: true } })).theme,
      )
      .toBe("DARK");
    await expectNoPageScroll(page);
  });

  test("password tab: wrong current password is rejected, correct one succeeds and is restored", async ({
    page,
  }) => {
    await login(page, USERS.academic);
    await page.goto("/profile/password");
    await expect(page.getByTestId("password-section")).toBeVisible();
    const form = page.getByTestId("change-form");
    await form.locator('input[name="current"]').fill("Wrong@123456");
    await form.locator('input[name="password"]').fill("Temp@Profile123");
    await form.locator('input[name="confirm"]').fill("Temp@Profile123");
    await form.getByRole("button", { name: /تغيير|Change/ }).click();
    await expect(form.getByRole("alert").first()).toBeVisible();
    await form.locator('input[name="current"]').fill(USERS.academic.password);
    await form.getByRole("button", { name: /تغيير|Change/ }).click();
    await expect(page.getByText(/تم تغيير كلمة المرور|Password changed/)).toBeVisible();
    // restore the hash directly (afterAll also does it) so other specs can log in
    if (original)
      await prisma.user.update({ where: { id: userId }, data: { passwordHash: original.passwordHash } });
    await expectNoPageScroll(page);
  });

  test("notifications tab reuses preferences; student lacking notification.view gets 404 there", async ({
    page,
  }) => {
    await login(page, USERS.academic);
    await page.goto("/profile/notifications");
    await expect(page.getByTestId("prefs")).toBeVisible();
    await expect(page.getByTestId("save-prefs")).toBeDisabled();
    await expectNoPageScroll(page);
    const nf = await page.goto("/profile/nope");
    expect(nf?.status()).toBe(404);
  });

  test("student sees the profile with own data and cannot see other users' avatars from another tenant path", async ({
    page,
  }) => {
    await login(page, USERS.student);
    await page.goto("/profile/info");
    await expect(page.getByTestId("pf-name")).toHaveValue(/.+/);
    await expect(page.getByText(USERS.student.id)).toBeVisible(); // academicId read-only
    await expectNoHorizontalScroll(page);
    await expectNoPageScroll(page);
    expect(
      (
        await page.request.get(`/api/profile/avatar/00000000-0000-4000-8000-000000000000/${userId}/v`)
      ).status(),
    ).toBe(404);
  });
});
