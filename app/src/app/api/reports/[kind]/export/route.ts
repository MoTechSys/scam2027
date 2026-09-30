/**
 * GET /api/reports/{users|courses|files}/export?<filters> — streamed CSV of a report dataset (FR-RPT-001/002/003).
 * Gate: `report.export` + the tab permission (`report.users` / `report.courses` / `report.files`).
 *
 * Same contract as /api/audit/export: strict Zod filters (unknown → 400), UTF-8 BOM, RFC 4180 + formula-injection
 * guard, keyset batches, cap REPORT_EXPORT_MAX_ROWS, `attachment` + `no-store`, and the export itself is audited
 * (`report.export`). Instructor scope narrowing is applied by the queries (never wider than the page).
 */
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/has-permission";
import { loadCtx } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { failure } from "@/lib/result";
import { csvLine } from "@/features/audit/schemas";
import {
  countFilesExport,
  countUsersExport,
  iterateFilesExport,
  iterateUsersExport,
  loadCoursesExport,
  tenantTimeZone,
} from "@/features/reports/queries";
import {
  COURSES_CSV_COLUMNS,
  FILES_CSV_COLUMNS,
  REPORT_EXPORT_MAX_ROWS,
  TAB_PERMISSION,
  USERS_CSV_COLUMNS,
  coursesReportFilterSchema,
  filesReportFilterSchema,
  isExportKind,
  usersReportFilterSchema,
} from "@/features/reports/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOM = "\uFEFF";

function csvResponse(
  name: string,
  stream: ReadableStream<Uint8Array>,
  rows: number,
  total: number,
): Response {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="report-${name}-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-report-rows": String(rows),
      "x-report-total": String(total),
    },
  });
}

/** Turn an async batch iterator into a CSV byte stream with a header line. */
function streamBatches<T>(
  header: readonly string[],
  iterator: AsyncGenerator<T[]>,
  toCells: (row: T) => unknown[],
  requestId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(BOM + csvLine([...header])));
    },
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) return controller.close();
        let chunk = "";
        for (const r of value) chunk += csvLine(toCells(r));
        controller.enqueue(encoder.encode(chunk));
      } catch (err) {
        logger.error({ err, requestId }, "report.export.stream_failed");
        controller.error(err);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}

async function* once<T>(rows: T[]): AsyncGenerator<T[]> {
  if (rows.length) yield rows;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  if (!isExportKind(kind)) return NextResponse.json(failure("NOT_FOUND", "تقرير غير معروف"), { status: 404 });

  const auth = await loadCtx();
  if (!auth.ok) return NextResponse.json(failure("UNAUTHENTICATED", "يجب تسجيل الدخول"), { status: 401 });
  const ctx = auth.ctx;
  if (!hasPermission(ctx, "report.export") || !hasPermission(ctx, TAB_PERMISSION[kind]))
    return NextResponse.json(failure("FORBIDDEN", "لا تملك صلاحية تصدير هذا التقرير"), { status: 403 });

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());

  if (kind === "users") {
    const parsed = usersReportFilterSchema.safeParse(raw);
    if (!parsed.success)
      return NextResponse.json(failure("VALIDATION", "مرشّحات غير صالحة"), { status: 400 });
    const total = await countUsersExport(ctx, parsed.data);
    const rows = Math.min(total, REPORT_EXPORT_MAX_ROWS);
    await audit(ctx, {
      action: "report.export",
      entity: "Report",
      entityId: kind,
      after: { filters: parsed.data, rows, total },
    });
    const stream = streamBatches(
      USERS_CSV_COLUMNS,
      iterateUsersExport(ctx, parsed.data),
      (r) => [r.academicId, r.name, r.email, r.status, r.roles, r.lastLoginAt, r.createdAt],
      ctx.requestId,
    );
    return csvResponse(kind, stream, rows, total);
  }

  if (kind === "courses") {
    const parsed = coursesReportFilterSchema.safeParse(raw);
    if (!parsed.success)
      return NextResponse.json(failure("VALIDATION", "مرشّحات غير صالحة"), { status: 400 });
    const data = await loadCoursesExport(ctx, parsed.data);
    await audit(ctx, {
      action: "report.export",
      entity: "Report",
      entityId: kind,
      after: { filters: parsed.data, rows: data.length, total: data.length },
    });
    const stream = streamBatches(
      COURSES_CSV_COLUMNS,
      once(data),
      (r) => [
        r.code,
        r.name,
        r.department,
        r.creditHours,
        r.isActive,
        r.offerings,
        r.openOfferings,
        r.activeEnrollments,
        r.instructors,
        r.files,
      ],
      ctx.requestId,
    );
    return csvResponse(kind, stream, data.length, data.length);
  }

  const parsed = filesReportFilterSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json(failure("VALIDATION", "مرشّحات غير صالحة"), { status: 400 });
  const timeZone = await tenantTimeZone(ctx);
  const total = await countFilesExport(ctx, parsed.data, timeZone);
  const rows = Math.min(total, REPORT_EXPORT_MAX_ROWS);
  await audit(ctx, {
    action: "report.export",
    entity: "Report",
    entityId: kind,
    after: { filters: parsed.data, rows, total },
  });
  const stream = streamBatches(
    FILES_CSV_COLUMNS,
    iterateFilesExport(ctx, parsed.data, timeZone),
    (r) => [
      r.name,
      r.category,
      r.status,
      r.mimeType,
      r.sizeBytes,
      r.course,
      r.offering,
      r.uploader,
      r.downloads,
      r.createdAt,
    ],
    ctx.requestId,
  );
  return csvResponse(kind, stream, rows, total);
}
