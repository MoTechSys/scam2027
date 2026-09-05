/**
 * Roles module — Zod schemas shared by Server Actions and forms (FR-ROL-001..006).
 */
import { z } from "zod";
import { isPermissionCode } from "@/lib/auth/permissions";

/** Custom role codes: UPPER_SNAKE, 3–40 chars, must not collide with system codes (checked server-side). */
export const ROLE_CODE_RE = /^[A-Z][A-Z0-9_]{2,39}$/;

const permissionCodesSchema = z
  .array(z.string().refine(isPermissionCode, "صلاحية غير معروفة"))
  .max(200)
  .transform((codes) => [...new Set(codes)]);

export const createRoleSchema = z.object({
  code: z.string().trim().toUpperCase().regex(ROLE_CODE_RE, "أحرف لاتينية كبيرة وأرقام وشرطة سفلية (3–40)"),
  name: z.string().trim().min(2, "حرفان على الأقل").max(80, "الحد الأقصى 80 حرفًا"),
  nameEn: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(300, "الحد الأقصى 300 حرف").optional().or(z.literal("")),
  permissionCodes: permissionCodesSchema,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.omit({ code: true, permissionCodes: true }).extend({ id: z.string().uuid() });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({ id: z.string().uuid(), permissionCodes: permissionCodesSchema });
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

export const roleIdSchema = z.object({ id: z.string().uuid() });

export const cloneRoleSchema = createRoleSchema.pick({ code: true, name: true }).extend({ sourceId: z.string().uuid() });
export type CloneRoleInput = z.infer<typeof cloneRoleSchema>;

export const roleListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  tab: z.enum(["ALL", "SYSTEM", "CUSTOM", "DELETED"]).optional().default("ALL"),
});
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;
