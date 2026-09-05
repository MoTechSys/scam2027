/**
 * Zod contracts for every `Json` column in prisma/schema.prisma (docs/30-architecture/02-DATA-MODEL.md §3).
 * Rule: a Json column is never read or written without passing through its schema here.
 */
import { z } from "zod";

// ── CourseOffering.schedule ──────────────────────────────────────────────
export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm");

export const offeringScheduleSlotSchema = z
  .object({
    day: z.enum(WEEKDAYS),
    startTime: hhmm,
    endTime: hhmm,
    room: z.string().trim().max(60).optional(),
  })
  .refine((s) => s.endTime > s.startTime, { message: "endTime must be after startTime", path: ["endTime"] });

export const offeringScheduleSchema = z.array(offeringScheduleSlotSchema).max(14);
export type OfferingSchedule = z.infer<typeof offeringScheduleSchema>;

// ── Notification.targetSpec ──────────────────────────────────────────────
export const NOTIFICATION_TARGET_KINDS = [
  "ALL",
  "ROLE",
  "COLLEGE",
  "DEPARTMENT",
  "MAJOR",
  "LEVEL",
  "OFFERING",
  "USERS",
] as const;
export type NotificationTargetKind = (typeof NOTIFICATION_TARGET_KINDS)[number];

const uuidList = z.array(z.string().uuid()).min(1).max(500);

export const notificationTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ALL") }),
  z.object({ kind: z.literal("ROLE"), ids: uuidList }),
  z.object({ kind: z.literal("COLLEGE"), ids: uuidList }),
  z.object({ kind: z.literal("DEPARTMENT"), ids: uuidList }),
  z.object({ kind: z.literal("MAJOR"), ids: uuidList }),
  z.object({ kind: z.literal("LEVEL"), ids: uuidList }),
  z.object({ kind: z.literal("OFFERING"), ids: uuidList }),
  z.object({ kind: z.literal("USERS"), ids: uuidList }),
]);
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;

// ── Job.payload (per type) ───────────────────────────────────────────────
export const JOB_TYPES = [
  "trash.purge",
  "notification.fanout",
  "enrollment.import",
  "mail.send",
  "export.tenant",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const jobPayloadSchemas = {
  "trash.purge": z.object({ olderThanDays: z.number().int().min(1).max(365).default(30) }),
  "notification.fanout": z.object({ notificationId: z.string().uuid() }),
  "enrollment.import": z.object({
    offeringId: z.string().uuid(),
    fileId: z.string().uuid(),
    dryRun: z.boolean().default(false),
  }),
  "mail.send": z.object({
    to: z.string().email(),
    template: z.string().min(1).max(60),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  }),
  "export.tenant": z.object({ requestedBy: z.string().uuid(), scope: z.array(z.string()).default([]) }),
} as const satisfies Record<JobType, z.ZodTypeAny>;

export function parseJobPayload<T extends JobType>(
  type: T,
  payload: unknown,
): z.infer<(typeof jobPayloadSchemas)[T]> {
  return jobPayloadSchemas[type].parse(payload) as z.infer<(typeof jobPayloadSchemas)[T]>;
}
