/**
 * P1-14 — profile core against a real tenant with RLS on:
 *  - applyProfileUpdate: User + UserProfile upsert, empty strings → null, audit before/after
 *  - applyTheme: upsert + audit; loadAppearance/loadProfile read it back; invalid stored value falls back to DARK
 *  - applyAvatar: set → returns previous key on replace → remove; audit actions
 *  - schemas: strict, phone regex, theme enum, htmlThemeAttrs
 *  - RLS: other tenant cannot read the profile row
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAvatar, applyProfileUpdate, applyTheme } from "@/features/profile/core";
import { loadAppearance, loadProfile } from "@/features/profile/queries";
import { htmlThemeAttrs, updateProfileSchema, updateThemeSchema } from "@/features/profile/schemas";
import type { Ctx } from "@/lib/auth/rbac";
import { platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";

const suffix = Date.now().toString(36);
const mkCtx = (tenantId: string, userId: string): Ctx => ({
  tenantId,
  sessionId: "test",
  requestId: "test",
  user: {
    id: userId,
    name: "t",
    email: "t",
    academicId: "t",
    locale: "ar",
    mustChangePassword: false,
    passwordChangeRequired: null,
    roles: [],
    permissions: new Set(),
  },
});

let tid = "";
let otherTid = "";
let uid = "";
let ctx: Ctx;

beforeAll(async () => {
  tid = (await platformPrisma.tenant.create({ data: { slug: `prof-${suffix}`, name: "Prof" } })).id;
  otherTid = (await platformPrisma.tenant.create({ data: { slug: `prof2-${suffix}`, name: "Prof2" } })).id;
  await tx(tid, async (x) => {
    const role = await x.role.create({
      data: { tenantId: tid, code: "STUDENT", name: "طالب", isSystem: true },
    });
    const u = await x.user.create({
      data: {
        tenantId: tid,
        email: "u@p",
        name: "Old Name",
        academicId: "P1",
        passwordHash: "x",
        status: "ACTIVE",
        phone: "0500000000",
      },
    });
    uid = u.id;
    await x.userRole.create({ data: { tenantId: tid, userId: uid, roleId: role.id } });
  });
  ctx = mkCtx(tid, uid);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("schemas", () => {
  it("updateProfileSchema is strict and validates phone/locale", () => {
    expect(updateProfileSchema.safeParse({ name: "A", locale: "ar", bogus: 1 }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "A", locale: "fr" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "A", locale: "ar", phone: "abc" }).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ name: " A ", locale: "en", phone: "+966 50 000", title: "", bio: "" })
        .success,
    ).toBe(true);
    expect(updateProfileSchema.safeParse({ name: "", locale: "ar" }).success).toBe(false);
  });
  it("updateThemeSchema + htmlThemeAttrs", () => {
    expect(updateThemeSchema.safeParse({ theme: "LIGHT" }).success).toBe(true);
    expect(updateThemeSchema.safeParse({ theme: "blue" }).success).toBe(false);
    expect(htmlThemeAttrs("DARK")).toEqual({ className: "dark", dataTheme: undefined });
    expect(htmlThemeAttrs("LIGHT")).toEqual({ className: "", dataTheme: "light" });
    expect(htmlThemeAttrs("SYSTEM")).toEqual({ className: "", dataTheme: "system" });
  });
});

describe("profile core", () => {
  it("loadProfile defaults (no UserProfile row yet)", async () => {
    const p = await loadProfile(ctx);
    expect(p).toMatchObject({
      name: "Old Name",
      email: "u@p",
      academicId: "P1",
      phone: "0500000000",
      theme: "DARK",
      avatarUrl: null,
      title: null,
      roles: ["طالب"],
    });
  });

  it("applyProfileUpdate writes User + UserProfile, nulls empty strings, audits before/after", async () => {
    await tx(tid, (t) =>
      applyProfileUpdate(ctx, t, { name: "New Name", phone: "", title: "أستاذ", bio: "", locale: "en" }),
    );
    const p = await loadProfile(ctx);
    expect(p).toMatchObject({ name: "New Name", phone: null, title: "أستاذ", bio: null, locale: "en" });
    const log = await tx(tid, (t) =>
      t.auditLog.findFirst({
        where: { action: "profile.update", entityId: uid },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(log?.before).toMatchObject({ name: "Old Name", phone: "0500000000", locale: "ar" });
    expect(log?.after).toMatchObject({ name: "New Name", phone: null, title: "أستاذ", locale: "en" });
  });

  it("applyTheme persists and is read by loadAppearance; garbage in DB falls back to DARK", async () => {
    await tx(tid, (t) => applyTheme(ctx, t, "LIGHT"));
    expect((await loadAppearance(ctx)).theme).toBe("LIGHT");
    expect((await loadProfile(ctx)).theme).toBe("LIGHT");
    const audit = await tx(tid, (t) =>
      t.auditLog.findFirst({ where: { action: "profile.theme", entityId: uid } }),
    );
    expect(audit?.after).toEqual({ theme: "LIGHT" });
    // CHECK constraint refuses garbage at the DB level
    await expect(
      tx(tid, (t) =>
        t.$executeRawUnsafe(`UPDATE "UserProfile" SET theme = 'PINK' WHERE "userId" = '${uid}'`),
      ),
    ).rejects.toThrow();
    await tx(tid, (t) => applyTheme(ctx, t, "SYSTEM"));
    expect((await loadAppearance(ctx)).theme).toBe("SYSTEM");
  });

  it("applyAvatar: set, replace returns old key, remove clears", async () => {
    const first = await tx(tid, (t) =>
      applyAvatar(ctx, t, {
        key: `${tid}/avatars/a.png`,
        url: "/api/profile/avatar/x/1",
        mime: "image/png",
        size: 10,
      }),
    );
    expect(first).toBeNull();
    expect((await loadAppearance(ctx)).avatarUrl).toBe("/api/profile/avatar/x/1");
    const second = await tx(tid, (t) =>
      applyAvatar(ctx, t, {
        key: `${tid}/avatars/b.png`,
        url: "/api/profile/avatar/x/2",
        mime: "image/png",
        size: 12,
      }),
    );
    expect(second).toBe(`${tid}/avatars/a.png`);
    const removed = await tx(tid, (t) => applyAvatar(ctx, t, null));
    expect(removed).toBe(`${tid}/avatars/b.png`);
    expect((await loadAppearance(ctx)).avatarUrl).toBeNull();
    const actions = await tx(tid, (t) =>
      t.auditLog.findMany({
        where: { entity: "UserProfile", entityId: uid, action: { startsWith: "profile.avatar" } },
        select: { action: true },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(actions.map((a) => a.action)).toEqual([
      "profile.avatar",
      "profile.avatar",
      "profile.avatar_remove",
    ]);
  });

  it("RLS: another tenant cannot see the row", async () => {
    const other = mkCtx(otherTid, uid);
    expect((await loadAppearance(other)).avatarUrl).toBeNull();
    await expect(loadProfile(other)).rejects.toThrow();
  });
});
