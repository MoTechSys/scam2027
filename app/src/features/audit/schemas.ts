/**
 * Audit log — Zod schemas + pure helpers (FR-SET-004, UC-SYS-002, P1-09).
 *
 * The audit trail is append-only and read-only from the UI: no Server Action mutates it. This module holds the
 * URL-query contract of `/audit`, the CSV export contract, and two pure helpers (CSV escaping, before/after diff)
 * that are unit-tested without a database.
 */
import { z } from "zod";

const uuid = z.string().uuid();

/** Empty strings from URL params / form inputs collapse to `undefined` so filters are truly optional. */
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

/** `YYYY-MM-DD` from `<input type="date">`; the query layer widens it to a day boundary in the tenant time zone. */
const isoDay = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ YYYY-MM-DD")
    .optional(),
);

export const AUDIT_ACTOR_KINDS = ["ANY", "USER", "SYSTEM"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

export const auditFiltersSchema = z.object({
  /** Free text over action / entity / entityId / actor name / actor email. */
  q: optionalTrimmed(80),
  actorId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  /** `SYSTEM` = rows with actorId null (jobs, retention), `USER` = any human actor. */
  actorKind: z.enum(AUDIT_ACTOR_KINDS).optional().default("ANY"),
  entity: optionalTrimmed(64),
  entityId: optionalTrimmed(64),
  /** Exact `resource.verb` or a `resource.` prefix (matches all verbs of a resource). */
  action: optionalTrimmed(64),
  from: isoDay,
  to: isoDay,
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export const auditQuerySchema = auditFiltersSchema.extend({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).optional().default(25),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** Export = same filters, no pagination; bounded so one request can never stream the whole table. */
export const AUDIT_EXPORT_MAX_ROWS = 50_000;
export const AUDIT_EXPORT_BATCH = 1_000;
export const auditExportSchema = auditFiltersSchema.strict();
export type AuditExportInput = z.infer<typeof auditExportSchema>;

/** Route param for the details sheet. */
export const auditEntryIdSchema = z.object({ id: uuid }).strict();

// ───────────────────────────── pure helpers ─────────────────────────────

/**
 * RFC 4180 field escaping + formula-injection guard (OWASP CSV injection): cells starting with `= + - @ \t \r`
 * are prefixed with a single quote so spreadsheets treat them as text.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(cells: unknown[]): string {
  return cells.map(csvEscape).join(",") + "\r\n";
}

export const AUDIT_CSV_COLUMNS = [
  "createdAt",
  "action",
  "entity",
  "entityId",
  "actorId",
  "actorName",
  "actorEmail",
  "ip",
  "requestId",
  "before",
  "after",
] as const;

export type DiffKind = "added" | "removed" | "changed" | "same";
export type DiffRow = { key: string; before: unknown; after: unknown; kind: DiffKind };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => stableEqual(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && stableEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Shallow key-wise diff of the `before` / `after` JSON snapshots. Nested objects are compared structurally and
 * shown as one row (the sheet renders them as JSON). Non-object snapshots (e.g. `after: {count: 3}` vs nothing)
 * still produce rows so the UI never shows an empty panel for a row that has data.
 */
export function diffSnapshots(before: unknown, after: unknown): DiffRow[] {
  const b = isPlainObject(before) ? before : before === undefined || before === null ? {} : { value: before };
  const a = isPlainObject(after) ? after : after === undefined || after === null ? {} : { value: after };
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort((x, y) => x.localeCompare(y));
  return keys.map((key) => {
    const inB = key in b;
    const inA = key in a;
    const kind: DiffKind = !inB
      ? "added"
      : !inA
        ? "removed"
        : stableEqual(b[key], a[key])
          ? "same"
          : "changed";
    return { key, before: inB ? b[key] : undefined, after: inA ? a[key] : undefined, kind };
  });
}

/** `user.create` → `user`; `auth.login.success` → `auth`. */
export function actionResource(action: string): string {
  return action.split(".")[0] ?? action;
}

/** Day bounds in a fixed IANA time zone without a date library (Intl only; DST-safe via offset probing). */
export function dayRangeInTimeZone(day: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    return asUtc - t; // ms the zone is ahead of UTC at instant t
  };
  const start = new Date(utcMidnight - offsetAt(utcMidnight));
  const nextMidnight = utcMidnight + 86_400_000;
  const end = new Date(nextMidnight - offsetAt(nextMidnight) - 1);
  return { start, end };
}
