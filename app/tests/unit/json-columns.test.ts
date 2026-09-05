import { describe, expect, it } from "vitest";
import {
  notificationTargetSchema,
  offeringScheduleSchema,
  parseJobPayload,
} from "@/lib/contracts/json-columns";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("Json column contracts", () => {
  it("offering schedule: valid slots, rejects inverted times and bad format", () => {
    expect(
      offeringScheduleSchema.parse([{ day: "SUN", startTime: "08:00", endTime: "09:30", room: "A101" }]),
    ).toHaveLength(1);
    expect(
      offeringScheduleSchema.safeParse([{ day: "SUN", startTime: "10:00", endTime: "09:00" }]).success,
    ).toBe(false);
    expect(
      offeringScheduleSchema.safeParse([{ day: "SUN", startTime: "8:00", endTime: "09:00" }]).success,
    ).toBe(false);
    expect(
      offeringScheduleSchema.safeParse([{ day: "XYZ", startTime: "08:00", endTime: "09:00" }]).success,
    ).toBe(false);
  });

  it("notification target: ALL needs no ids, others need ≥1 uuid", () => {
    expect(notificationTargetSchema.parse({ kind: "ALL" })).toEqual({ kind: "ALL" });
    expect(notificationTargetSchema.parse({ kind: "USERS", ids: [uuid] }).kind).toBe("USERS");
    expect(notificationTargetSchema.safeParse({ kind: "USERS", ids: [] }).success).toBe(false);
    expect(notificationTargetSchema.safeParse({ kind: "ROLE", ids: ["not-uuid"] }).success).toBe(false);
    expect(notificationTargetSchema.safeParse({ kind: "TEAM", ids: [uuid] }).success).toBe(false);
  });

  it("job payload: per-type schema with defaults", () => {
    expect(parseJobPayload("trash.purge", {})).toEqual({ olderThanDays: 30 });
    expect(parseJobPayload("notification.fanout", { notificationId: uuid })).toEqual({
      notificationId: uuid,
    });
    expect(() => parseJobPayload("mail.send", { to: "nope", template: "x" })).toThrow();
  });
});
