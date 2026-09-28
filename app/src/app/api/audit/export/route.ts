/**
 * GET /api/audit/export?<filters> — streamed CSV of the audit log (FR-SET-004, P1-09). Gate: `audit.export`.
 *
 * - Same filter contract as `/audit` (`auditExportSchema`, strict: unknown params → 400).
 * - Streams in keyset batches (no long transaction, bounded memory), capped at AUDIT_EXPORT_MAX_ROWS.
 * - UTF-8 BOM so Excel opens Arabic correctly; formula-injection-safe cells; `attachment`, `no-store`.
 * - The export itself is audited (`audit.export` with the filters and the row count) — exports are sensitive.
 */
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/has-permission";
import { loadCtx } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { failure } from "@/lib/result";
import { countAuditLogs, iterateAuditLogs, tenantTimeZone } from "@/features/audit/queries";
import {
  AUDIT_CSV_COLUMNS,
  AUDIT_EXPORT_MAX_ROWS,
  auditExportSchema,
  csvLine,
} from "@/features/audit/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOM = "\uFEFF";

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await loadCtx();
  if (!auth.ok) return NextResponse.json(failure("UNAUTHENTICATED", "يجب تسجيل الدخول"), { status: 401 });
  const ctx = auth.ctx;
  if (!hasPermission(ctx, "audit.export"))
    return NextResponse.json(failure("FORBIDDEN", "لا تملك صلاحية تصدير سجل التدقيق"), { status: 403 });

  const parsed = auditExportSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json(failure("VALIDATION", "مرشّحات غير صالحة"), { status: 400 });
  const filters = parsed.data;
  const timeZone = await tenantTimeZone(ctx);

  // Audit the export up-front (the count is what the actor asked for, capped to what will actually be streamed).
  const total = await countAuditLogs(ctx, filters, timeZone);
  const rows = Math.min(total, AUDIT_EXPORT_MAX_ROWS);
  await audit(ctx, { action: "audit.export", entity: "AuditLog", after: { filters, rows, total } });

  const encoder = new TextEncoder();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const iterator = iterateAuditLogs(ctx, filters, timeZone);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(BOM + csvLine([...AUDIT_CSV_COLUMNS])));
    },
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) return controller.close();
        let chunk = "";
        for (const r of value) {
          chunk += csvLine([
            r.createdAt,
            r.action,
            r.entity,
            r.entityId,
            r.actor.kind === "user" ? r.actor.id : "",
            r.actor.kind === "user" ? (r.actor.deleted ? "[deleted]" : r.actor.name) : "system",
            r.actor.kind === "user" && !r.actor.deleted ? r.actor.email : "",
            r.ip,
            r.requestId,
            r.before,
            r.after,
          ]);
        }
        controller.enqueue(encoder.encode(chunk));
      } catch (err) {
        logger.error({ err, requestId: ctx.requestId }, "audit.export.stream_failed");
        controller.error(err);
      }
    },
    async cancel() {
      await iterator.return();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "cache-control": "private, no-store",
      "x-audit-rows": String(rows),
      "x-audit-total": String(total),
    },
  });
}
