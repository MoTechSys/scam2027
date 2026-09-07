/**
 * Trash registry — one handler per soft-deletable kind (FR-SYS-001, P1-08).
 *
 * Each handler knows how to list / count / restore / purge its rows inside a tenant transaction. Restore guards
 * mirror the module's own `restore*Action` (users → `assertCanManageUser`, roles → permission-set outranking,
 * offerings → parent course must be live, files → attached course/section must be live). Purge is a hard delete;
 * rows that are still referenced by a `NoAction`/`Restrict` FK (course ← offerings/files, offering ← files,
 * user ← uploaded files) are reported as `blocked` instead of failing the whole batch.
 *
 * Server-only, but vitest-loadable: imports permission predicates from `has-permission.ts`, never `rbac.ts`
 * (next-auth → next/server is not resolvable under vitest — see STATUS.knownDebt). Never import from a
 * `"use server"` file here (actions cannot export helpers) and never import this from a client component.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { hasRole, type PermissionCtx } from "@/lib/auth/has-permission";
import { canManagePermissionSet } from "@/lib/auth/permissions";
import type { TenantTx } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";
import { formatBytes } from "@/lib/storage/validate";
import { purgeAfter, type TrashKind } from "./schemas";

export type TrashRow = {
  id: string;
  kind: TrashKind;
  /** Primary label (name / title / course code). */
  title: string;
  /** Secondary label (email / code / section / uploader). */
  subtitle: string | null;
  /** Small extra fact (academic id, size, status …). */
  meta: string | null;
  deletedAt: Date;
  /** `deletedAt + TRASH_RETENTION_DAYS` — when the purge job may remove it. */
  purgeAfter: Date;
};

export type PurgeOutcome = {
  /** Ids actually deleted. */
  purged: string[];
  /** Ids skipped because a hard FK still references them (caller decides whether that is an error). */
  blocked: string[];
  /** Object keys to remove from storage AFTER the transaction commits (files only). */
  storageKeys: string[];
};

export type TrashHandler = {
  /** Audit `entity` name (Prisma model). */
  entity: string;
  /** Routes to revalidate after a restore/purge of this kind. */
  paths: (id: string) => string[];
  list(t: TenantTx, q: string, skip: number, take: number): Promise<TrashRow[]>;
  count(t: TenantTx, q: string): Promise<number>;
  /** Clears `deletedAt` for one row; throws AppError(NOT_FOUND | CONFLICT | FORBIDDEN). */
  restore(ctx: PermissionCtx, t: TenantTx, id: string): Promise<Record<string, unknown>>;
  /** Hard-deletes the given trashed ids (only rows with `deletedAt != null` are ever touched). */
  purge(t: TenantTx, ids: string[]): Promise<PurgeOutcome>;
  /** Ids of rows trashed on or before `cutoff` (for the retention job). */
  expired(t: TenantTx, cutoff: Date, take: number): Promise<string[]>;
};

const trashed = { deletedAt: { not: null } } as const;
const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });
const row = (
  kind: TrashKind,
  r: { id: string; deletedAt: Date | null },
  title: string,
  subtitle: string | null,
  meta: string | null,
): TrashRow => {
  const deletedAt = r.deletedAt ?? new Date();
  return { id: r.id, kind, title, subtitle, meta, deletedAt, purgeAfter: purgeAfter(deletedAt) };
};
const byDeleted = { deletedAt: "desc" } as const;

/* ───────────── USER ───────────── */
const userWhere = (q: string): Prisma.UserWhereInput =>
  q
    ? { ...trashed, OR: [{ name: contains(q) }, { email: contains(q) }, { academicId: contains(q) }] }
    : trashed;
const userSelect = {
  id: true,
  name: true,
  email: true,
  academicId: true,
  status: true,
  deletedAt: true,
  roles: { select: { role: { select: { code: true, permissions: { select: { permissionCode: true } } } } } },
} as const;

/** In-tx twin of `rbac.assertCanManageUser`: no admin target for non-admins, no permission escalation. */
function assertCanRestoreUser(
  ctx: PermissionCtx,
  roles: { role: { code: string; permissions: { permissionCode: string }[] } }[],
) {
  if (roles.some((r) => r.role.code === "TENANT_ADMIN") && !hasRole(ctx, "TENANT_ADMIN"))
    throw new AppError("FORBIDDEN", "لا يمكن إدارة مستخدم أعلى صلاحية");
  const codes = roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode));
  if (!canManagePermissionSet(ctx.user.permissions, codes))
    throw new AppError("FORBIDDEN", "لا يمكن إدارة مستخدم يملك صلاحيات لا تملكها");
}

const USER: TrashHandler = {
  entity: "User",
  paths: (id) => ["/users", `/users/${id}`],
  list: async (t, q, skip, take) =>
    (await t.user.findMany({ where: userWhere(q), select: userSelect, orderBy: byDeleted, skip, take })).map(
      (u) => row("USER", u, u.name, u.email, u.academicId),
    ),
  count: (t, q) => t.user.count({ where: userWhere(q) }),
  restore: async (ctx, t, id) => {
    const u = await t.user.findFirst({ where: { id, ...trashed }, select: userSelect });
    if (!u) throw new AppError("NOT_FOUND", "المستخدم غير موجود في السلة");
    assertCanRestoreUser(ctx, u.roles);
    await t.user.update({ where: { id }, data: { deletedAt: null } });
    return { name: u.name, email: u.email };
  },
  purge: async (t, ids) => {
    const rows = await t.user.findMany({
      where: { id: { in: ids }, ...trashed },
      select: { id: true, _count: { select: { uploadedFiles: true } } },
    });
    const blocked = rows.filter((r) => r._count.uploadedFiles > 0).map((r) => r.id);
    const purged = rows.filter((r) => r._count.uploadedFiles === 0).map((r) => r.id);
    if (purged.length) await t.user.deleteMany({ where: { id: { in: purged } } });
    return { purged, blocked, storageKeys: [] };
  },
  expired: async (t, cutoff, take) =>
    (await t.user.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true }, take })).map(
      (r) => r.id,
    ),
};

/* ───────────── ROLE ───────────── */
const roleWhere = (q: string): Prisma.RoleWhereInput =>
  q ? { ...trashed, OR: [{ name: contains(q) }, { nameEn: contains(q) }, { code: contains(q) }] } : trashed;
const roleSelect = {
  id: true,
  code: true,
  name: true,
  deletedAt: true,
  permissions: { select: { permissionCode: true } },
} as const;

const ROLE: TrashHandler = {
  entity: "Role",
  paths: (id) => ["/roles", `/roles/${id}`, "/users"],
  list: async (t, q, skip, take) =>
    (await t.role.findMany({ where: roleWhere(q), select: roleSelect, orderBy: byDeleted, skip, take })).map(
      (r) => row("ROLE", r, r.name, r.code, String(r.permissions.length)),
    ),
  count: (t, q) => t.role.count({ where: roleWhere(q) }),
  restore: async (ctx, t, id) => {
    const r = await t.role.findFirst({ where: { id, ...trashed }, select: roleSelect });
    if (!r) throw new AppError("NOT_FOUND", "الدور غير موجود في السلة");
    if (
      !canManagePermissionSet(
        ctx.user.permissions,
        r.permissions.map((p) => p.permissionCode),
      )
    )
      throw new AppError("FORBIDDEN", "لا يمكن استرجاع دور يحوي صلاحيات لا تملكها");
    await t.role.update({ where: { id }, data: { deletedAt: null } });
    return { code: r.code, name: r.name };
  },
  purge: async (t, ids) => {
    const rows = await t.role.findMany({ where: { id: { in: ids }, ...trashed }, select: { id: true } });
    const purged = rows.map((r) => r.id);
    if (purged.length) await t.role.deleteMany({ where: { id: { in: purged } } });
    return { purged, blocked: [], storageKeys: [] };
  },
  expired: async (t, cutoff, take) =>
    (await t.role.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true }, take })).map(
      (r) => r.id,
    ),
};

/* ───────────── COURSE ───────────── */
const courseWhere = (q: string): Prisma.CourseWhereInput =>
  q ? { ...trashed, OR: [{ name: contains(q) }, { nameEn: contains(q) }, { code: contains(q) }] } : trashed;
const courseSelect = { id: true, code: true, name: true, creditHours: true, deletedAt: true } as const;

const COURSE: TrashHandler = {
  entity: "Course",
  paths: (id) => ["/courses", `/courses/${id}`, "/offerings"],
  list: async (t, q, skip, take) =>
    (
      await t.course.findMany({ where: courseWhere(q), select: courseSelect, orderBy: byDeleted, skip, take })
    ).map((c) => row("COURSE", c, c.name, c.code, String(c.creditHours))),
  count: (t, q) => t.course.count({ where: courseWhere(q) }),
  restore: async (_ctx, t, id) => {
    const c = await t.course.findFirst({ where: { id, ...trashed }, select: courseSelect });
    if (!c) throw new AppError("NOT_FOUND", "المقرر غير موجود في السلة");
    await t.course.update({ where: { id }, data: { deletedAt: null } });
    return { code: c.code, name: c.name };
  },
  purge: async (t, ids) => {
    // Offerings (Restrict) and files (NoAction) keep a course alive — purge/detach them first.
    const rows = await t.course.findMany({
      where: { id: { in: ids }, ...trashed },
      select: { id: true, _count: { select: { offerings: true, files: true } } },
    });
    const blocked = rows.filter((r) => r._count.offerings + r._count.files > 0).map((r) => r.id);
    const purged = rows.filter((r) => r._count.offerings + r._count.files === 0).map((r) => r.id);
    if (purged.length) await t.course.deleteMany({ where: { id: { in: purged } } });
    return { purged, blocked, storageKeys: [] };
  },
  expired: async (t, cutoff, take) =>
    (await t.course.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true }, take })).map(
      (r) => r.id,
    ),
};

/* ───────────── OFFERING ───────────── */
const offeringWhere = (q: string): Prisma.CourseOfferingWhereInput =>
  q
    ? {
        ...trashed,
        OR: [{ section: contains(q) }, { course: { code: contains(q) } }, { course: { name: contains(q) } }],
      }
    : trashed;
const offeringSelect = {
  id: true,
  section: true,
  status: true,
  deletedAt: true,
  course: { select: { id: true, code: true, name: true, deletedAt: true } },
  semester: { select: { name: true, academicYear: { select: { code: true } } } },
} as const;

const OFFERING: TrashHandler = {
  entity: "CourseOffering",
  paths: (id) => ["/offerings", `/offerings/${id}`, "/courses"],
  list: async (t, q, skip, take) =>
    (
      await t.courseOffering.findMany({
        where: offeringWhere(q),
        select: offeringSelect,
        orderBy: byDeleted,
        skip,
        take,
      })
    ).map((o) =>
      row(
        "OFFERING",
        o,
        `${o.course.code} — ${o.course.name}`,
        `${o.semester.academicYear.code} · ${o.semester.name} · ${o.section}`,
        o.status,
      ),
    ),
  count: (t, q) => t.courseOffering.count({ where: offeringWhere(q) }),
  restore: async (_ctx, t, id) => {
    const o = await t.courseOffering.findFirst({ where: { id, ...trashed }, select: offeringSelect });
    if (!o) throw new AppError("NOT_FOUND", "الشعبة غير موجودة في السلة");
    if (o.course.deletedAt) throw new AppError("CONFLICT", "استرجع المقرر أولًا؛ الشعبة تتبع مقررًا محذوفًا");
    await t.courseOffering.update({ where: { id }, data: { deletedAt: null } });
    return { course: o.course.code, section: o.section };
  },
  purge: async (t, ids) => {
    // Files attached to the section (NoAction FK) keep it alive. Enrollments/instructors cascade.
    const rows = await t.courseOffering.findMany({
      where: { id: { in: ids }, ...trashed },
      select: { id: true, _count: { select: { files: true } } },
    });
    const blocked = rows.filter((r) => r._count.files > 0).map((r) => r.id);
    const purged = rows.filter((r) => r._count.files === 0).map((r) => r.id);
    if (purged.length) await t.courseOffering.deleteMany({ where: { id: { in: purged } } });
    return { purged, blocked, storageKeys: [] };
  },
  expired: async (t, cutoff, take) =>
    (
      await t.courseOffering.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true }, take })
    ).map((r) => r.id),
};

/* ───────────── FILE ───────────── */
const fileWhere = (q: string): Prisma.FileWhereInput =>
  q
    ? {
        ...trashed,
        OR: [{ name: contains(q) }, { originalName: contains(q) }, { uploader: { name: contains(q) } }],
      }
    : trashed;
const fileSelect = {
  id: true,
  name: true,
  size: true,
  storageKey: true,
  deletedAt: true,
  uploader: { select: { name: true } },
  course: { select: { code: true, deletedAt: true } },
  offering: { select: { section: true, deletedAt: true } },
} as const;

const FILE: TrashHandler = {
  entity: "File",
  paths: () => ["/files", "/dashboard"],
  list: async (t, q, skip, take) =>
    (await t.file.findMany({ where: fileWhere(q), select: fileSelect, orderBy: byDeleted, skip, take })).map(
      (f) =>
        row(
          "FILE",
          f,
          f.name,
          [f.uploader.name, f.course?.code].filter(Boolean).join(" · "),
          formatBytes(f.size),
        ),
    ),
  count: (t, q) => t.file.count({ where: fileWhere(q) }),
  restore: async (_ctx, t, id) => {
    const f = await t.file.findFirst({ where: { id, ...trashed }, select: fileSelect });
    if (!f) throw new AppError("NOT_FOUND", "الملف غير موجود في السلة");
    if (f.course?.deletedAt || f.offering?.deletedAt)
      throw new AppError("CONFLICT", "استرجع المقرر/الشعبة أولًا؛ الملف مرتبط بعنصر محذوف");
    await t.file.update({ where: { id }, data: { deletedAt: null } });
    return { name: f.name, size: f.size };
  },
  purge: async (t, ids) => {
    const rows = await t.file.findMany({
      where: { id: { in: ids }, ...trashed },
      select: { id: true, storageKey: true },
    });
    const purged = rows.map((r) => r.id);
    if (purged.length) await t.file.deleteMany({ where: { id: { in: purged } } });
    return { purged, blocked: [], storageKeys: rows.map((r) => r.storageKey) };
  },
  expired: async (t, cutoff, take) =>
    (await t.file.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true }, take })).map(
      (r) => r.id,
    ),
};

/* ───────────── NOTIFICATION ───────────── */
const notificationWhere = (q: string): Prisma.NotificationWhereInput =>
  q ? { ...trashed, OR: [{ title: contains(q) }, { body: contains(q) }] } : trashed;
const notificationSelect = {
  id: true,
  title: true,
  type: true,
  recipientCount: true,
  deletedAt: true,
} as const;

const NOTIFICATION: TrashHandler = {
  entity: "Notification",
  paths: () => ["/notifications", "/dashboard"],
  list: async (t, q, skip, take) =>
    (
      await t.notification.findMany({
        where: notificationWhere(q),
        select: notificationSelect,
        orderBy: byDeleted,
        skip,
        take,
      })
    ).map((n) => row("NOTIFICATION", n, n.title, n.type, String(n.recipientCount))),
  count: (t, q) => t.notification.count({ where: notificationWhere(q) }),
  restore: async (_ctx, t, id) => {
    const n = await t.notification.findFirst({ where: { id, ...trashed }, select: notificationSelect });
    if (!n) throw new AppError("NOT_FOUND", "الإشعار غير موجود في السلة");
    await t.notification.update({ where: { id }, data: { deletedAt: null } });
    return { title: n.title };
  },
  purge: async (t, ids) => {
    const rows = await t.notification.findMany({
      where: { id: { in: ids }, ...trashed },
      select: { id: true },
    });
    const purged = rows.map((r) => r.id);
    if (purged.length) await t.notification.deleteMany({ where: { id: { in: purged } } });
    return { purged, blocked: [], storageKeys: [] };
  },
  expired: async (t, cutoff, take) =>
    (
      await t.notification.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true }, take })
    ).map((r) => r.id),
};

export const TRASH_REGISTRY: Readonly<Record<TrashKind, TrashHandler>> = {
  USER,
  ROLE,
  COURSE,
  OFFERING,
  FILE,
  NOTIFICATION,
};

/**
 * Purge order for the retention job: leaves first so parents are not blocked by their children
 * (files → notifications → offerings → courses → roles → users).
 */
export const PURGE_ORDER: readonly TrashKind[] = [
  "FILE",
  "NOTIFICATION",
  "OFFERING",
  "COURSE",
  "ROLE",
  "USER",
];
