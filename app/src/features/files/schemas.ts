/**
 * Files — Zod schemas (FR-FIL-001..008, 011).
 *
 * Upload metadata travels as multipart fields next to the binary (validated by `uploadMetaSchema`); everything else
 * is a normal Server Action input. Category / classification enums mirror prisma/schema.prisma.
 */
import { z } from "zod";
import { urlBool } from "@/features/courses/schemas";

export const FILE_CATEGORIES = ["LECTURE", "ASSIGNMENT", "EXAM", "REFERENCE", "OTHER"] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];
export const DATA_CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];
export const FILE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

const uuid = z.string().uuid();
export const idSchema = z.object({ id: uuid });
export const idsSchema = z.object({ ids: z.array(uuid).min(1).max(200) });

const name = z.string().trim().min(1, "الاسم مطلوب").max(160);
const description = z.string().trim().max(1000).optional().or(z.literal(""));
/** Empty select → undefined → stored as null. */
const optionalId = z.preprocess((v) => (v === "" || v === "NONE" ? undefined : v), uuid.optional());

export const uploadMetaSchema = z.object({
  category: z.enum(FILE_CATEGORIES).optional().default("OTHER"),
  classification: z.enum(DATA_CLASSIFICATIONS).optional().default("INTERNAL"),
  courseId: optionalId,
  offeringId: optionalId,
  description,
});
export type UploadMeta = z.infer<typeof uploadMetaSchema>;

export const updateFileSchema = z.object({
  id: uuid,
  name,
  category: z.enum(FILE_CATEGORIES),
  classification: z.enum(DATA_CLASSIFICATIONS),
  courseId: optionalId,
  offeringId: optionalId,
  description,
});
export type UpdateFileInput = z.input<typeof updateFileSchema>;

/* ───────────── List query (URL) ───────────── */
export const FILE_TABS = ["ALL", "MINE", "TRASH"] as const;
export type FileTab = (typeof FILE_TABS)[number];

export const fileListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  tab: z.enum(FILE_TABS).optional().default("ALL"),
  category: z.enum(FILE_CATEGORIES).optional(),
  classification: z.enum(DATA_CLASSIFICATIONS).optional(),
  courseId: uuid.optional(),
  offeringId: uuid.optional(),
  /** Own-scope actors are always limited; this flag is only meaningful for `file.manage_all`. */
  mine: urlBool.optional().default(false),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});
export type FileListQuery = z.infer<typeof fileListQuerySchema>;
