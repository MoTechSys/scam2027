/**
 * Audit log — read side (FR-SET-004, P1-09). Gate: `audit.view` (list / detail / facets), `audit.export` (CSV).
 *
 * `AuditLog.actorId` has no FK on purpose (rows must survive actor hard-deletion — ADR-0006 / PDPL retention), so
 * actor names are resolved with one extra `IN (...)` query per page and missing actors are surfaced as `deleted`.
 * Every query runs through the tenant client (RLS) and touches only `(tenantId, …)` indexes:
 *   list → (tenantId, createdAt) · entity filter → (tenantId, entity, entityId) · actor filter → (tenantId, actorId, createdAt).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import { db, tx, type TenantTx } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import {
  AUDIT_EXPORT_BATCH,
  AUDIT_EXPORT_MAX_ROWS,
  dayRangeInTimeZone,
  type AuditFilters,
  type AuditQuery,
} from "./schemas";

export type AuditActor =
  | { kind: "system" }
  | { kind: "user"; id: string; name: string; email: string; academicId: string; deleted: false }
  | { kind: "user"; id: string; name: null; email: null; academicId: null; deleted: true };

export type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string | null;
  actor: AuditActor;
  ip: string | null;
  requestId: string | null;
  /** True when the row carries a before or after snapshot (the sheet shows a diff). */
  hasDiff: boolean;
};

export type AuditEntry = AuditRow & {
  before: unknown;
  after: unknown;
  userAgent: string | null;
};

export type AuditFacets = {
  entities: string[];
  actions: string[];
  /** Human actors who appear in the log (for the actor filter), newest activity first. */
  actors: { id: string; name: string; email: string }[];
};

const rowSelect = {
  id: true,
  createdAt: true,
  action: true,
  entity: true,
  entityId: true,
  actorId: true,
  ip: true,
  requestId: true,
  before: true,
  after: true,
} satisfies Prisma.AuditLogSelect;

type RawRow = Prisma.AuditLogGetPayload<{ select: typeof rowSelect }>;

/** Translate the validated filters into a Prisma `where`. Time zone widens `from`/`to` to whole tenant days. */
export function auditWhere(tenantId: string, f: AuditFilters, timeZone: string): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [{ tenantId }];
  if (f.actorKind === "SYSTEM") and.push({ actorId: null });
  if (f.actorKind === "USER") and.push({ actorId: { not: null } });
  if (f.actorId) and.push({ actorId: f.actorId });
  if (f.entity) and.push({ entity: f.entity });
  if (f.entityId) and.push({ entityId: f.entityId });
  if (f.action)
    and.push(f.action.endsWith(".") ? { action: { startsWith: f.action } } : { action: f.action });
  if (f.from || f.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = dayRangeInTimeZone(f.from, timeZone).start;
    if (f.to) createdAt.lte = dayRangeInTimeZone(f.to, timeZone).end;
    and.push({ createdAt });
  }
  if (f.q) {
    const q = f.q;
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { entity: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { requestId: { contains: q, mode: "insensitive" } },
        { ip: { contains: q } },
      ],
    });
  }
  return { AND: and };
}

async function resolveActors(
  t: TenantTx,
  tenantId: string,
  ids: readonly (string | null)[],
): Promise<Map<string, { name: string; email: string; academicId: string }>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const users = await t.user.findMany({
    where: { tenantId, id: { in: unique } }, // deleted users are still resolvable by name (soft-delete keeps the row)
    select: { id: true, name: true, email: true, academicId: true },
  });
  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email, academicId: u.academicId }]));
}

function toActor(
  actorId: string | null,
  users: Map<string, { name: string; email: string; academicId: string }>,
): AuditActor {
  if (!actorId) return { kind: "system" };
  const u = users.get(actorId);
  return u
    ? { kind: "user", id: actorId, name: u.name, email: u.email, academicId: u.academicId, deleted: false }
    : { kind: "user", id: actorId, name: null, email: null, academicId: null, deleted: true };
}

function toRow(r: RawRow, users: Map<string, { name: string; email: string; academicId: string }>): AuditRow {
  return {
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    actor: toActor(r.actorId, users),
    ip: r.ip,
    requestId: r.requestId,
    hasDiff: r.before !== null || r.after !== null,
  };
}

/**
 * Free-text search also matches actor name/email. Actors are looked up first (bounded to 50 ids) so the log query
 * stays on indexed columns instead of joining a table that has no FK.
 */
async function actorIdsMatching(t: TenantTx, tenantId: string, q: string): Promise<string[]> {
  const users = await t.user.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { academicId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true },
    take: 50,
  });
  return users.map((u) => u.id);
}

function withActorSearch(where: Prisma.AuditLogWhereInput, q: string | undefined, actorIds: string[]) {
  if (!q || !actorIds.length) return where;
  const and = [...(where.AND as Prisma.AuditLogWhereInput[])];
  const idx = and.findIndex((c) => "OR" in c);
  const or = [...(and[idx] as { OR: Prisma.AuditLogWhereInput[] }).OR, { actorId: { in: actorIds } }];
  and[idx] = { OR: or };
  return { AND: and };
}

export async function listAuditLogs(ctx: Ctx, q: AuditQuery, timeZone: string): Promise<Page<AuditRow>> {
  const skip = (q.page - 1) * q.pageSize;
  return tx(ctx.tenantId, async (t) => {
    const base = auditWhere(ctx.tenantId, q, timeZone);
    const where = withActorSearch(base, q.q, q.q ? await actorIdsMatching(t, ctx.tenantId, q.q) : []);
    const [rows, total] = await Promise.all([
      t.auditLog.findMany({
        where,
        select: rowSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: q.pageSize,
      }),
      t.auditLog.count({ where }),
    ]);
    const users = await resolveActors(
      t,
      ctx.tenantId,
      rows.map((r) => r.actorId),
    );
    return paginate(
      rows.map((r) => toRow(r, users)),
      total,
      q.page,
      q.pageSize,
    );
  });
}

export async function getAuditEntry(ctx: Ctx, id: string): Promise<AuditEntry | null> {
  return tx(ctx.tenantId, async (t) => {
    const r = await t.auditLog.findFirst({
      where: { tenantId: ctx.tenantId, id },
      select: { ...rowSelect, userAgent: true },
    });
    if (!r) return null;
    const users = await resolveActors(t, ctx.tenantId, [r.actorId]);
    return { ...toRow(r, users), before: r.before, after: r.after, userAgent: r.userAgent };
  });
}

/** Distinct values for the filter controls. Bounded; `distinct` uses the (tenantId, entity, …) index. */
export async function auditFacets(ctx: Ctx): Promise<AuditFacets> {
  return tx(ctx.tenantId, async (t) => {
    const [entities, actions, actorRows] = await Promise.all([
      t.auditLog.findMany({
        where: { tenantId: ctx.tenantId },
        distinct: ["entity"],
        select: { entity: true },
        orderBy: { entity: "asc" },
        take: 200,
      }),
      t.auditLog.findMany({
        where: { tenantId: ctx.tenantId },
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
        take: 500,
      }),
      t.auditLog.findMany({
        where: { tenantId: ctx.tenantId, actorId: { not: null } },
        distinct: ["actorId"],
        select: { actorId: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    const users = await resolveActors(
      t,
      ctx.tenantId,
      actorRows.map((r) => r.actorId),
    );
    const actors = actorRows
      .map((r) => r.actorId!)
      .filter((id) => users.has(id))
      .map((id) => ({ id, name: users.get(id)!.name, email: users.get(id)!.email }));
    return { entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action), actors };
  });
}

export type ExportRow = AuditEntry;

/**
 * Cursor-paginated iterator for the CSV stream: `(createdAt, id)` keyset — stable under concurrent inserts, never
 * skips or repeats, capped at AUDIT_EXPORT_MAX_ROWS. Each batch is its own short RLS transaction so the export
 * never holds a long-lived transaction open while the HTTP body drains.
 */
export async function* iterateAuditLogs(
  ctx: Ctx,
  f: AuditFilters,
  timeZone: string,
): AsyncGenerator<ExportRow[], void, void> {
  let cursor: { createdAt: Date; id: string } | null = null;
  let emitted = 0;
  const actorIds = f.q ? await tx(ctx.tenantId, (t) => actorIdsMatching(t, ctx.tenantId, f.q!)) : [];
  const where = withActorSearch(auditWhere(ctx.tenantId, f, timeZone), f.q, actorIds);
  while (emitted < AUDIT_EXPORT_MAX_ROWS) {
    const take = Math.min(AUDIT_EXPORT_BATCH, AUDIT_EXPORT_MAX_ROWS - emitted);
    const c = cursor;
    const batch: ExportRow[] = await tx(ctx.tenantId, async (t) => {
      const rows = await t.auditLog.findMany({
        where: c
          ? {
              AND: [
                where,
                { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] },
              ],
            }
          : where,
        select: { ...rowSelect, userAgent: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
      });
      const users = await resolveActors(
        t,
        ctx.tenantId,
        rows.map((r) => r.actorId),
      );
      return rows.map((r) => ({
        ...toRow(r, users),
        before: r.before,
        after: r.after,
        userAgent: r.userAgent,
      }));
    });
    if (!batch.length) return;
    emitted += batch.length;
    const last = batch[batch.length - 1]!;
    cursor = { createdAt: last.createdAt, id: last.id };
    yield batch;
    if (batch.length < take) return;
  }
}

/** Count for the export confirmation / row cap notice (same where as the list). */
export async function countAuditLogs(ctx: Ctx, f: AuditFilters, timeZone: string): Promise<number> {
  return tx(ctx.tenantId, async (t) => {
    const where = withActorSearch(
      auditWhere(ctx.tenantId, f, timeZone),
      f.q,
      f.q ? await actorIdsMatching(t, ctx.tenantId, f.q) : [],
    );
    return t.auditLog.count({ where });
  });
}

/** Tenant time zone for day-boundary filters (read once per request). */
export async function tenantTimeZone(ctx: Ctx): Promise<string> {
  const t = await db(ctx.tenantId).tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { timezone: true },
  });
  return t?.timezone ?? "Asia/Riyadh";
}
