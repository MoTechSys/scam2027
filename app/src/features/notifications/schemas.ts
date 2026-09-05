/**
 * Notifications — Zod schemas (FR-NTF-001..005, 008).
 *
 * `targetSpec` reuses the Json-column contract (`notificationTargetSchema`) so the stored spec and the compose form
 * share one definition. Type / priority enums mirror prisma/schema.prisma. Preferences are in-app only in P1
 * (channel EMAIL/PUSH arrive with P2/P4).
 */
import { z } from "zod";
import { NOTIFICATION_TARGET_KINDS, notificationTargetSchema } from "@/lib/contracts/json-columns";

export { NOTIFICATION_TARGET_KINDS, notificationTargetSchema };
export type { NotificationTarget, NotificationTargetKind } from "@/lib/contracts/json-columns";

export const NOTIFICATION_TYPES = [
  "ANNOUNCEMENT",
  "SYSTEM",
  "ACADEMIC",
  "FILE",
  "QUIZ",
  "ASSIGNMENT",
  "GRADE",
  "ATTENDANCE",
  "SECURITY",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Types a human sender may pick in the compose dialog (SYSTEM/SECURITY are reserved for automated senders). */
export const COMPOSABLE_TYPES = [
  "ANNOUNCEMENT",
  "ACADEMIC",
  "FILE",
  "QUIZ",
  "ASSIGNMENT",
  "GRADE",
  "ATTENDANCE",
] as const;

/** Types a user may mute in-app. SYSTEM / SECURITY are always delivered (account safety, PDPL notices). */
export const MUTABLE_TYPES = [
  "ANNOUNCEMENT",
  "ACADEMIC",
  "FILE",
  "QUIZ",
  "ASSIGNMENT",
  "GRADE",
  "ATTENDANCE",
] as const;
export type MutableType = (typeof MUTABLE_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** Recipients above this count are fanned out by the `notification.fanout` job instead of inline. */
export const SYNC_FANOUT_LIMIT = 500;

const uuid = z.string().uuid();
export const idSchema = z.object({ id: uuid });
export const idsSchema = z.object({ ids: z.array(uuid).min(1).max(200) });

/** In-app relative path only (no protocol / host) — prevents open redirects from notification links. */
const inAppLink = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?!\/)[^\s]*$/, "الرابط يجب أن يكون مسارًا داخليًا يبدأ بـ /")
  .optional()
  .or(z.literal(""));

export const sendNotificationSchema = z.object({
  title: z.string().trim().min(3, "العنوان مطلوب (3 أحرف على الأقل)").max(160),
  body: z.string().trim().min(1, "نص الإشعار مطلوب").max(4000),
  type: z.enum(COMPOSABLE_TYPES).default("ANNOUNCEMENT"),
  priority: z.enum(NOTIFICATION_PRIORITIES).default("NORMAL"),
  link: inAppLink,
  target: notificationTargetSchema,
});
export type SendNotificationInput = z.input<typeof sendNotificationSchema>;

export const preferenceSchema = z.object({
  type: z.enum(MUTABLE_TYPES),
  enabled: z.boolean(),
});
export const savePreferencesSchema = z.object({
  items: z.array(preferenceSchema).min(1).max(MUTABLE_TYPES.length),
});

export const searchUsersSchema = z.object({ q: z.string().trim().max(80).default("") });

/* ───────────── List query (URL) ───────────── */
export const INBOX_TABS = ["ALL", "UNREAD", "ARCHIVED", "SENT"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export const inboxQuerySchema = z.object({
  tab: z.enum(INBOX_TABS).optional().default("ALL"),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  q: z.string().trim().max(80).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;
