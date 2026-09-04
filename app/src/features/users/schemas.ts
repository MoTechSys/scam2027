/**
 * Users module — Zod schemas shared by Server Actions and forms (FR-USR-001..005, 009, 010, 012).
 */
import { z } from "zod";
import { PASSWORD_MIN } from "@/lib/auth/password";

export const USER_STATUSES = ["PENDING_ACTIVATION", "ACTIVE", "FROZEN", "DISABLED"] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

const trimmed = (max: number) => z.string().trim().min(1, "مطلوب").max(max, `الحد الأقصى ${max} حرفًا`);

export const userListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum([...USER_STATUSES, "ALL", "DELETED"]).optional().default("ALL"),
  roleId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
  sort: z.enum(["name", "createdAt", "lastLoginAt", "academicId"]).optional().default("createdAt"),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const createUserSchema = z.object({
  name: trimmed(120),
  email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(190),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s-]*$/, "رقم هاتف غير صالح")
    .optional()
    .or(z.literal("")),
  /** Empty → auto-generated per tenant format (FR-USR-002). */
  academicId: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-]*$/, "أحرف لاتينية وأرقام وشرطات فقط")
    .optional()
    .or(z.literal("")),
  roleIds: z.array(z.string().uuid()).min(1, "اختر دورًا واحدًا على الأقل").max(10),
  title: z.string().trim().max(80).optional().or(z.literal("")),
  /** Empty → temporary password generated and returned once. */
  password: z.string().min(PASSWORD_MIN, `${PASSWORD_MIN} أحرف على الأقل`).max(128).optional().or(z.literal("")),
  status: z.enum(["PENDING_ACTIVATION", "ACTIVE"]).default("ACTIVE"),
  mustChangePassword: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .pick({ name: true, email: true, phone: true, title: true })
  .extend({ id: z.string().uuid(), locale: z.enum(["ar", "en"]).optional() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdSchema = z.object({ id: z.string().uuid() });

export const setStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(USER_STATUSES),
});

export const assignRolesSchema = z.object({
  id: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).min(1, "اختر دورًا واحدًا على الأقل").max(10),
});

export const resetPasswordSchema = z.object({
  id: z.string().uuid(),
  /** Empty → generate a temporary password. */
  password: z.string().min(PASSWORD_MIN).max(128).optional().or(z.literal("")),
});
