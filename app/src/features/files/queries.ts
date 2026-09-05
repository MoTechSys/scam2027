/**
 * Files — read side (RSC). Gate with `file.view`; rows are narrowed by `fileScopeWhere`
 * (uploader → own files, instructor/student → files of their offerings, `file.manage_all` → everything).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import type { Option } from "@/lib/contracts/option";
import { db } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import { offeringScopeWhere } from "@/features/offerings/scope";
import { fileScopeWhere, isFileAdmin } from "./scope";
import type { DataClassification, FileCategory, FileListQuery, FileStatus, FileTab } from "./schemas";

export type FileRow = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: FileCategory;
  classification: DataClassification;
  status: FileStatus;
  description: string | null;
  downloads: number;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  offeringId: string | null;
  offeringSection: string | null;
  uploaderId: string;
  uploaderName: string;
  isOwner: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const fileSelect = {
  id: true,
  name: true,
  originalName: true,
  mimeType: true,
  size: true,
  category: true,
  classification: true,
  status: true,
  description: true,
  downloads: true,
  courseId: true,
  offeringId: true,
  uploaderId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { code: true, name: true } },
  offering: { select: { section: true } },
  uploader: { select: { name: true } },
} satisfies Prisma.FileSelect;
type RawFile = Prisma.FileGetPayload<{ select: typeof fileSelect }>;

function toRow(ctx: Ctx, { course, offering, uploader, ...f }: RawFile): FileRow {
  return {
    ...f,
    courseCode: course?.code ?? null,
    courseName: course?.name ?? null,
    offeringSection: offering?.section ?? null,
    uploaderName: uploader.name,
    isOwner: f.uploaderId === ctx.user.id,
  };
}

function baseWhere(ctx: Ctx, q: FileListQuery): Prisma.FileWhereInput {
  const and: Prisma.FileWhereInput[] = [fileScopeWhere(ctx)];
  if (q.mine || q.tab === "MINE") and.push({ uploaderId: ctx.user.id });
  if (q.category) and.push({ category: q.category });
  if (q.classification) and.push({ classification: q.classification });
  if (q.offeringId) and.push({ offeringId: q.offeringId });
  else if (q.courseId) and.push({ courseId: q.courseId });
  return { AND: and };
}

function tabWhere(tab: FileTab): Prisma.FileWhereInput {
  return tab === "TRASH" ? { deletedAt: { not: null } } : { deletedAt: null };
}

function searchWhere(q: string): Prisma.FileWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { originalName: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { course: { is: { code: { contains: q, mode: "insensitive" } } } },
    ],
  };
}

export async function listFiles(ctx: Ctx, q: FileListQuery): Promise<Page<FileRow>> {
  const where: Prisma.FileWhereInput = { AND: [baseWhere(ctx, q), tabWhere(q.tab), searchWhere(q.q)] };
  const prisma = db(ctx.tenantId);
  const [total, rows] = await Promise.all([
    prisma.file.count({ where }),
    prisma.file.findMany({
      where,
      select: fileSelect,
      orderBy: q.tab === "TRASH" ? [{ deletedAt: "desc" }] : [{ createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return paginate(
    rows.map((r) => toRow(ctx, r)),
    total,
    q.page,
    q.pageSize,
  );
}

/** Tab badges under the same filters (TRASH only counts the actor's own deletable rows unless admin). */
export async function fileCounts(ctx: Ctx, q: FileListQuery): Promise<Record<FileTab, number>> {
  const prisma = db(ctx.tenantId);
  const filters = baseWhere(ctx, { ...q, mine: false, tab: "ALL" });
  const [all, mine, trash] = await Promise.all([
    prisma.file.count({ where: { AND: [filters, { deletedAt: null }] } }),
    prisma.file.count({ where: { AND: [filters, { deletedAt: null, uploaderId: ctx.user.id }] } }),
    prisma.file.count({
      where: {
        AND: [filters, { deletedAt: { not: null } }, isFileAdmin(ctx) ? {} : { uploaderId: ctx.user.id }],
      },
    }),
  ]);
  return { ALL: all, MINE: mine, TRASH: trash };
}

export type FileDetail = FileRow & { checksum: string; storageKey: string; downloadLogCount: number };

export async function getFileDetail(ctx: Ctx, id: string): Promise<FileDetail | null> {
  const row = await db(ctx.tenantId).file.findFirst({
    where: { AND: [{ id }, fileScopeWhere(ctx)] },
    select: { ...fileSelect, checksum: true, storageKey: true, _count: { select: { downloadLogs: true } } },
  });
  if (!row) return null;
  const { checksum, storageKey, _count, ...rest } = row;
  return { ...toRow(ctx, rest), checksum, storageKey, downloadLogCount: _count.downloadLogs };
}

/** Storage used by the tenant (bytes, live files only) + the subscription cap. */
export async function storageUsage(ctx: Ctx): Promise<{ usedBytes: number; capBytes: number }> {
  const prisma = db(ctx.tenantId);
  const [agg, sub] = await Promise.all([
    prisma.file.aggregate({ where: { deletedAt: null }, _sum: { size: true } }),
    prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId }, select: { maxStorageGB: true } }),
  ]);
  return { usedBytes: agg._sum.size ?? 0, capBytes: (sub?.maxStorageGB ?? 20) * 1024 ** 3 };
}

/** Courses the actor may attach files to (tenant-wide → all active; else courses with in-scope offerings). */
export async function attachableCourseOptions(ctx: Ctx): Promise<Option[]> {
  const admin = isFileAdmin(ctx);
  const rows = await db(ctx.tenantId).course.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(admin ? {} : { offerings: { some: { deletedAt: null, ...offeringScopeWhere(ctx) } } }),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
    take: 500,
  });
  return rows.map((r) => ({ id: r.id, label: `${r.code} — ${r.name}` }));
}

export type OfferingOption = Option & { courseId: string };
/** Offerings the actor may attach files to, grouped by course code for the select. */
export async function attachableOfferingOptions(ctx: Ctx): Promise<OfferingOption[]> {
  const admin = isFileAdmin(ctx);
  const rows = await db(ctx.tenantId).courseOffering.findMany({
    where: { deletedAt: null, status: { not: "ARCHIVED" }, ...(admin ? {} : offeringScopeWhere(ctx)) },
    select: {
      id: true,
      section: true,
      courseId: true,
      course: { select: { code: true } },
      semester: { select: { name: true } },
    },
    orderBy: [{ course: { code: "asc" } }, { section: "asc" }],
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    courseId: r.courseId,
    label: `${r.course.code} · ${r.section} — ${r.semester.name}`,
    group: r.course.code,
  }));
}
