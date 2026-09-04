/**
 * Academic-ID generator (FR-USR-002). Format is a per-tenant setting `users.academicIdFormat`
 * (default `YYYY-NNNNN`): `YYYY`/`YY` = current year, `N…` = zero-padded sequence per year, other chars literal.
 * The sequence is derived from the highest existing id sharing the same prefix inside a transaction, so
 * concurrent inserts fall back to a retry on unique violation (see actions.ts).
 */
import type { TenantTx } from "@/lib/db/tenant";

export const DEFAULT_ACADEMIC_ID_FORMAT = "YYYY-NNNNN";

export function renderAcademicId(format: string, year: number, seq: number): string {
  const m = format.match(/N+/);
  const width = m ? m[0].length : 5;
  return format
    .replace("YYYY", String(year))
    .replace("YY", String(year).slice(-2))
    .replace(/N+/, String(seq).padStart(width, "0"));
}

export function academicIdPrefix(format: string, year: number): string {
  const idx = format.search(/N+/);
  const head = idx === -1 ? format : format.slice(0, idx);
  return head.replace("YYYY", String(year)).replace("YY", String(year).slice(-2));
}

export async function nextAcademicId(tx: TenantTx, tenantId: string, format = DEFAULT_ACADEMIC_ID_FORMAT): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = academicIdPrefix(format, year);
  const last = await tx.user.findFirst({
    where: { tenantId, academicId: { startsWith: prefix } },
    orderBy: { academicId: "desc" },
    select: { academicId: true },
  });
  const tail = last?.academicId.slice(prefix.length).match(/^\d+/)?.[0];
  const seq = tail ? Number(tail) + 1 : 1;
  return renderAcademicId(format, year, seq);
}

export async function tenantAcademicIdFormat(tx: TenantTx, tenantId: string): Promise<string> {
  const row = await tx.tenantSetting.findUnique({
    where: { tenantId_category_key: { tenantId, category: "users", key: "academicIdFormat" } },
    select: { value: true },
  });
  return typeof row?.value === "string" && /N+/.test(row.value) ? row.value : DEFAULT_ACADEMIC_ID_FORMAT;
}
