/**
 * P1-07 — pure notification logic: schemas (link/limits/preferences), preference filtering, recipient `where` shape per
 * target kind (sender always excluded) and target-kind grants per permission set (FR-NTF-001/002/003/008).
 */
import { describe, expect, it } from "vitest";
import { applyPreferences, isMutableType, recipientsWhere } from "@/features/notifications/core";
import {
  COMPOSABLE_TYPES,
  MUTABLE_TYPES,
  SYNC_FANOUT_LIMIT,
  inboxQuerySchema,
  savePreferencesSchema,
  sendNotificationSchema,
} from "@/features/notifications/schemas";
import { allowedTargetKinds, isNotificationAdmin } from "@/features/notifications/scope";
import type { PermissionCode } from "@/lib/auth/permissions";
import type { Ctx } from "@/lib/auth/rbac";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { title: "عنوان الإشعار", body: "نص", target: { kind: "ALL" } };
const ctx = (perms: PermissionCode[]): Pick<Ctx, "user"> => ({
  user: {
    id: "u",
    name: "t",
    email: "t",
    academicId: "t",
    locale: "ar",
    mustChangePassword: false,
    roles: [],
    permissions: new Set<PermissionCode>(perms),
  },
});

describe("sendNotificationSchema", () => {
  it("applies defaults (ANNOUNCEMENT / NORMAL) and trims", () => {
    const r = sendNotificationSchema.parse({ ...base, title: "  عنوان الإشعار  " });
    expect(r).toMatchObject({ title: "عنوان الإشعار", type: "ANNOUNCEMENT", priority: "NORMAL" });
  });
  it("rejects titles < 3 or > 160 and bodies > 4000", () => {
    expect(sendNotificationSchema.safeParse({ ...base, title: "اب" }).success).toBe(false);
    expect(sendNotificationSchema.safeParse({ ...base, title: "x".repeat(161) }).success).toBe(false);
    expect(sendNotificationSchema.safeParse({ ...base, body: "x".repeat(4001) }).success).toBe(false);
    expect(sendNotificationSchema.safeParse({ ...base, body: "" }).success).toBe(false);
  });
  it("accepts only in-app links (no open redirects)", () => {
    for (const link of ["/files", "/courses/abc?tab=x", "", undefined])
      expect(sendNotificationSchema.safeParse({ ...base, link }).success, String(link)).toBe(true);
    for (const link of ["//evil.com", "https://evil.com", "javascript:alert(1)", "files", "/a b"])
      expect(sendNotificationSchema.safeParse({ ...base, link }).success, link).toBe(false);
  });
  it("only composable types are allowed (SYSTEM / SECURITY reserved for the platform)", () => {
    expect(COMPOSABLE_TYPES).not.toContain("SYSTEM");
    expect(COMPOSABLE_TYPES).not.toContain("SECURITY");
    expect(sendNotificationSchema.safeParse({ ...base, type: "SYSTEM" }).success).toBe(false);
    expect(sendNotificationSchema.safeParse({ ...base, type: "GRADE" }).success).toBe(true);
  });
  it("validates the target discriminated union (ids 1..500 uuids, ALL has none)", () => {
    expect(sendNotificationSchema.safeParse({ ...base, target: { kind: "ROLE", ids: [] } }).success).toBe(
      false,
    );
    expect(sendNotificationSchema.safeParse({ ...base, target: { kind: "ROLE", ids: ["x"] } }).success).toBe(
      false,
    );
    expect(
      sendNotificationSchema.safeParse({ ...base, target: { kind: "USERS", ids: [uuid(1), uuid(2)] } })
        .success,
    ).toBe(true);
    expect(sendNotificationSchema.safeParse({ ...base, target: { kind: "NOPE" } }).success).toBe(false);
  });
});

describe("savePreferencesSchema / inboxQuerySchema", () => {
  it("accepts mutable types only and rejects SYSTEM / SECURITY", () => {
    expect(savePreferencesSchema.safeParse({ items: [{ type: "GRADE", enabled: false }] }).success).toBe(
      true,
    );
    expect(savePreferencesSchema.safeParse({ items: [{ type: "SYSTEM", enabled: false }] }).success).toBe(
      false,
    );
    expect(savePreferencesSchema.safeParse({ items: [{ type: "SECURITY", enabled: true }] }).success).toBe(
      false,
    );
    expect(savePreferencesSchema.safeParse({ items: [] }).success).toBe(false);
    expect(MUTABLE_TYPES).toHaveLength(7);
  });
  it("inbox query defaults and bounds", () => {
    expect(inboxQuerySchema.parse({})).toMatchObject({ tab: "ALL", page: 1, pageSize: 20, q: "" });
    expect(inboxQuerySchema.parse({ tab: "SENT", pageSize: "50", page: "3" })).toMatchObject({
      tab: "SENT",
      pageSize: 50,
      page: 3,
    });
    expect(inboxQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(inboxQuerySchema.safeParse({ tab: "NOPE" }).success).toBe(false);
  });
});

describe("applyPreferences / isMutableType", () => {
  it("filters opted-out users and is a no-op when nobody opted out", () => {
    const ids = [uuid(1), uuid(2), uuid(3)];
    expect(applyPreferences(ids, new Set())).toBe(ids);
    expect(applyPreferences(ids, new Set([uuid(2)]))).toEqual([uuid(1), uuid(3)]);
  });
  it("SYSTEM / SECURITY never honour preferences", () => {
    expect(isMutableType("SYSTEM")).toBe(false);
    expect(isMutableType("SECURITY")).toBe(false);
    expect(isMutableType("ANNOUNCEMENT")).toBe(true);
    expect(isMutableType("GRADE")).toBe(true);
    expect(SYNC_FANOUT_LIMIT).toBe(500);
  });
});

describe("recipientsWhere", () => {
  const me = uuid(9);
  it("always restricts to ACTIVE, non-deleted users and excludes the sender", () => {
    expect(recipientsWhere({ kind: "ALL" }, me)).toEqual({
      deletedAt: null,
      status: "ACTIVE",
      id: { not: me },
    });
    expect(recipientsWhere({ kind: "ALL" }, null)).toEqual({ deletedAt: null, status: "ACTIVE" });
  });
  it("USERS narrows ids and still excludes the sender", () => {
    const w = recipientsWhere({ kind: "USERS", ids: [uuid(1), me] }, me);
    expect(w.id).toEqual({ in: [uuid(1), me], not: me });
    expect(recipientsWhere({ kind: "USERS", ids: [uuid(1)] }, null).id).toEqual({ in: [uuid(1)] });
  });
  it("ROLE requires a live role; OFFERING reaches active students or instructors of live sections", () => {
    const role = recipientsWhere({ kind: "ROLE", ids: [uuid(5)] }, me);
    expect(role.roles).toEqual({ some: { roleId: { in: [uuid(5)] }, role: { deletedAt: null } } });
    const off = recipientsWhere({ kind: "OFFERING", ids: [uuid(7)] }, me);
    expect(off.OR).toHaveLength(2);
    expect(off.OR?.[0]).toMatchObject({
      enrollments: { some: { status: "ACTIVE", offeringId: { in: [uuid(7)] } } },
    });
    expect(off.OR?.[1]).toMatchObject({ teaching: { some: { offeringId: { in: [uuid(7)] } } } });
  });
  it("academic units resolve through active enrolments of the unit's courses", () => {
    for (const kind of ["COLLEGE", "DEPARTMENT", "MAJOR", "LEVEL"] as const) {
      const w = recipientsWhere({ kind, ids: [uuid(3)] }, me);
      expect(w.enrollments, kind).toMatchObject({
        some: { status: "ACTIVE", offering: { deletedAt: null, course: { deletedAt: null } } },
      });
    }
    const major = recipientsWhere({ kind: "MAJOR", ids: [uuid(3)] }, me);
    expect(JSON.stringify(major)).toContain('"majorId":{"in":["' + uuid(3) + '"]}');
    const level = recipientsWhere({ kind: "LEVEL", ids: [uuid(3)] }, me);
    expect(JSON.stringify(level)).toContain('"levelId"');
    const college = recipientsWhere({ kind: "COLLEGE", ids: [uuid(3)] }, me);
    expect(JSON.stringify(college)).toContain('"collegeId"');
  });
});

describe("allowedTargetKinds (grants → kinds)", () => {
  it("no notification.send → nothing, even with sub-grants", () => {
    expect(allowedTargetKinds(ctx(["notification.send_to_all"]))).toEqual([]);
    expect(allowedTargetKinds(ctx(["notification.view"]))).toEqual([]);
  });
  it("send alone → USERS only (own scope)", () => {
    expect(allowedTargetKinds(ctx(["notification.send"]))).toEqual(["USERS"]);
  });
  it("instructor grant set → OFFERING + USERS", () => {
    expect(allowedTargetKinds(ctx(["notification.send", "notification.send_to_offering"]))).toEqual([
      "OFFERING",
      "USERS",
    ]);
  });
  it("tenant admin set → every kind", () => {
    const kinds = allowedTargetKinds(
      ctx([
        "notification.send",
        "notification.send_to_all",
        "notification.send_to_role",
        "notification.send_to_offering",
      ]),
    );
    expect(kinds).toEqual(["ALL", "COLLEGE", "DEPARTMENT", "MAJOR", "LEVEL", "ROLE", "OFFERING", "USERS"]);
  });
  it("isNotificationAdmin ⇔ notification.manage", () => {
    expect(isNotificationAdmin(ctx(["notification.manage"]))).toBe(true);
    expect(isNotificationAdmin(ctx(["notification.send_to_all"]))).toBe(false);
  });
});
