import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/**
 * P1-11 — FR-AUTH-003/004/005/010/011 (ADR-0009). Each test creates its own throw-away user in the demo tenant
 * (E2E-prefixed, deleted in afterAll) so desktop + mobile runs never collide and seeded accounts stay untouched.
 * Links are read from `Job.result` (MAIL_TRANSPORT=log) — exactly what the mail would contain.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
});
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let tenantId = "";
const created: string[] = [];

async function makeUser(
  tag: string,
  data: {
    status?: "ACTIVE" | "PENDING_ACTIVATION";
    mustChangePassword?: boolean;
    passwordHash?: string | null;
  },
) {
  const { hash } = await import("@node-rs/argon2");
  const email = `e2e-${tag}-${stamp}@demo.edu`.toLowerCase();
  const password = "Start#Pass123";
  const u = await prisma.user.create({
    data: {
      tenantId,
      academicId: `E2E-${tag.toUpperCase()}-${stamp}`.slice(0, 40),
      email,
      name: `E2E ${tag} ${stamp}`,
      status: data.status ?? "ACTIVE",
      mustChangePassword: data.mustChangePassword ?? false,
      passwordHash:
        data.passwordHash === null
          ? null
          : await hash(password, { algorithm: 2, memoryCost: 8192, timeCost: 1, parallelism: 1 }),
      passwordChangedAt: data.passwordHash === null ? null : new Date(),
    },
    select: { id: true },
  });
  created.push(u.id);
  return { id: u.id, email, password };
}

async function latestLink(userEmail: string, path: "/reset" | "/activate"): Promise<string> {
  // The job is processed inline via after(); poll briefly for SUCCEEDED.
  for (let i = 0; i < 40; i++) {
    const job = await prisma.job.findFirst({
      where: {
        tenantId,
        type: "mail.send",
        status: "SUCCEEDED",
        payload: { path: ["to"], equals: userEmail },
      },
      orderBy: { createdAt: "desc" },
      select: { result: true },
    });
    const text = (job?.result as { text?: string } | null)?.text;
    const m = text?.match(
      new RegExp(`https?://[^\\s]+${path.replace("/", "\\/")}\\?token=([A-Za-z0-9_-]{43})`),
    );
    if (m) return `${path}?token=${m[1]}`;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${path} link mailed to ${userEmail}`);
}

async function fillNewPassword(page: Page, pw: string, confirm = pw) {
  await page.locator('input[name="password"]').fill(pw);
  await page.locator('input[name="confirm"]').fill(confirm);
}

test.beforeAll(async () => {
  tenantId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "demo" }, select: { id: true } })).id;
});

test.afterAll(async () => {
  await prisma.job.deleteMany({
    where: { tenantId, type: "mail.send", payload: { path: ["to"], string_contains: `-${stamp}@` } },
  });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

test.describe("password recovery (FR-AUTH-004)", () => {
  test("forgot → same answer for unknown id → mailed link → reset → old password fails, new works, other sessions revoked", async ({
    page,
  }) => {
    const u = await makeUser("reset", {});
    // an existing session on "another device"
    const other = await prisma.session.create({
      data: { tenantId, userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) },
      select: { id: true },
    });

    await page.goto("/forgot");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    // unknown identifier → identical success state (no enumeration)
    await page
      .getByTestId("forgot-form")
      .locator('input[name="identifier"]')
      .fill(`nobody-${stamp}@demo.edu`);
    await page.getByRole("button", { name: /إرسال رابط|Send reset link/ }).click();
    await expect(page.getByTestId("forgot-done")).toBeVisible();
    expect(
      await prisma.job.count({
        where: { tenantId, type: "mail.send", payload: { path: ["to"], equals: `nobody-${stamp}@demo.edu` } },
      }),
    ).toBe(0);

    // real user
    await page.goto("/forgot");
    await page.getByTestId("forgot-form").locator('input[name="identifier"]').fill(u.email);
    await page.getByRole("button", { name: /إرسال رابط|Send reset link/ }).click();
    await expect(page.getByTestId("forgot-done")).toBeVisible();
    const link = await latestLink(u.email, "/reset");
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "auth.reset.request", entityId: u.id },
    });
    expect(audit).not.toBeNull();

    // weak password → policy issue rendered, token still valid
    await page.goto(link);
    await expect(page.getByTestId("token-form")).toBeVisible();
    await fillNewPassword(page, "weak");
    await page.getByRole("button", { name: /حفظ كلمة المرور|Save password/ }).click();
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    // mismatch
    await fillNewPassword(page, "Fresh#Pass456", "Fresh#Pass457");
    await page.getByRole("button", { name: /حفظ كلمة المرور|Save password/ }).click();
    await expect(page.getByText(/غير متطابقتين|do not match/i)).toBeVisible();
    // success
    await fillNewPassword(page, "Fresh#Pass456");
    await page.getByRole("button", { name: /حفظ كلمة المرور|Save password/ }).click();
    await expect(page.getByTestId("token-done")).toBeVisible();

    // token is single-use
    await page.goto(link);
    await expect(page.getByTestId("token-invalid")).toHaveAttribute("data-reason", "USED");
    // other session revoked, sessionVersion bumped
    const otherRow = await prisma.session.findUniqueOrThrow({ where: { id: other.id } });
    expect(otherRow.revokedAt).not.toBeNull();

    // old password refused, new accepted
    await page.goto("/login");
    await page.getByRole("textbox", { name: /البريد|Email/i }).fill(u.email);
    await page.locator('input[name="password"]').fill(u.password);
    await page.getByRole("button", { name: /^دخول$|Sign in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await login(page, { id: u.email, password: "Fresh#Pass456" });
  });

  test("tampered / garbage tokens render an invalid state with a link to request a new one", async ({
    page,
  }) => {
    await page.goto(`/reset?token=${"x".repeat(43)}`);
    await expect(page.getByTestId("token-invalid")).toHaveAttribute("data-reason", "INVALID");
    await expect(page.getByRole("link", { name: /طلب رابط جديد|Request a new link/ })).toHaveAttribute(
      "href",
      "/forgot",
    );
    await page.goto("/reset");
    await expect(page.getByTestId("token-invalid")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("account activation (FR-AUTH-003)", () => {
  test("admin creates a pending user → activation mail → user sets password → account ACTIVE and can sign in", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // Create through the real UI (status = pending) so the activation job is produced by createUserAction.
    await page.goto("/users");
    await page.getByRole("button", { name: /مستخدم جديد|New user/i }).click();
    const dialog = page.getByRole("dialog");
    const email = `e2e-act-${stamp}@demo.edu`;
    await dialog.locator("#u-name").fill(`E2E act ${stamp}`);
    await dialog.locator("#u-email").fill(email);
    // uncheck "active" so the account is created PENDING_ACTIVATION (no temp password, activation mail instead)
    await dialog.getByTestId("u-status-active").click();
    await expect(dialog.getByTestId("u-status-active")).toHaveAttribute("data-state", "unchecked");
    await dialog.getByRole("button", { name: /حفظ|Save/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const u = await prisma.user.findFirstOrThrow({
      where: { tenantId, email },
      select: { id: true, status: true, passwordHash: true },
    });
    created.push(u.id);
    expect(u.status).toBe("PENDING_ACTIVATION");
    expect(u.passwordHash).toBeNull();

    const link = await latestLink(email, "/activate");
    // pending user cannot log in yet (no password) — and the link works without a session
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByTestId("token-form")).toBeVisible();
    await fillNewPassword(page, "Activ#Pass789");
    await page.getByRole("button", { name: /تفعيل الحساب|Activate account/ }).click();
    await expect(page.getByTestId("token-done")).toBeVisible();
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { status: true, emailVerifiedAt: true, passwordChangedAt: true },
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.passwordChangedAt).not.toBeNull();
    await login(page, { id: email, password: "Activ#Pass789" });
  });
});

test.describe("forced password change (FR-AUTH-010/011)", () => {
  test("mustChangePassword → every page lands on /change-password; wrong current refused; success unlocks the app", async ({
    page,
  }) => {
    const u = await makeUser("force", { mustChangePassword: true });
    await page.goto("/login");
    await page.getByRole("textbox", { name: /البريد|Email/i }).fill(u.email);
    await page.locator('input[name="password"]').fill(u.password);
    await page.getByRole("button", { name: /^دخول$|Sign in/i }).click();
    await expect(page).toHaveURL(/\/change-password\?reason=admin_reset/);
    await expect(page.getByTestId("change-reason")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    // dashboard is gated
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/change-password/);
    // wrong current password
    await page.locator('input[name="current"]').fill("Wrong#Pass000");
    await fillNewPassword(page, "Chosen#Pass321");
    await page.getByRole("button", { name: /تغيير كلمة المرور|Change password/ }).click();
    await expect(
      page
        .locator('[role="alert"]')
        .filter({ hasText: /غير صحيحة|incorrect/i })
        .first(),
    ).toBeVisible();
    // correct
    await page.locator('input[name="current"]').fill(u.password);
    await fillNewPassword(page, "Chosen#Pass321");
    await page.getByRole("button", { name: /تغيير كلمة المرور|Change password/ }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { mustChangePassword: true },
    });
    expect(row.mustChangePassword).toBe(false);
    expect(
      await prisma.auditLog.count({ where: { tenantId, action: "auth.password.change", entityId: u.id } }),
    ).toBe(1);
  });
});

test.describe("remember me (FR-AUTH-005)", () => {
  test("session row expiry follows the tenant policy: ~12 h without, ~30 d with the checkbox", async ({
    page,
  }) => {
    const u = await makeUser("remember", {});
    const HOUR = 3_600_000;
    await page.goto("/login");
    await page.getByRole("textbox", { name: /البريد|Email/i }).fill(u.email);
    await page.locator('input[name="password"]').fill(u.password);
    await page.getByRole("button", { name: /^دخول$|Sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const s1 = await prisma.session.findFirstOrThrow({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
    });
    const ttl1 = s1.expiresAt.getTime() - s1.createdAt.getTime();
    expect(ttl1).toBeGreaterThan(11 * HOUR);
    expect(ttl1).toBeLessThan(13 * HOUR);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("textbox", { name: /البريد|Email/i }).fill(u.email);
    await page.locator('input[name="password"]').fill(u.password);
    await page.getByRole("checkbox").first().click();
    await page.getByRole("button", { name: /^دخول$|Sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const s2 = await prisma.session.findFirstOrThrow({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
    });
    const ttl2 = s2.expiresAt.getTime() - s2.createdAt.getTime();
    expect(ttl2).toBeGreaterThan(29 * 24 * HOUR);
    expect(ttl2).toBeLessThan(31 * 24 * HOUR);
  });
});
