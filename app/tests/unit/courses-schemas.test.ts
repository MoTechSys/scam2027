/** P1-05 schema/pure-logic tests: course codes, offering transitions, schedule validation, identifiers parsing, urlBool. */
import { describe, expect, it } from "vitest";
import { courseListQuerySchema, createCourseSchema, urlBool } from "@/features/courses/schemas";
import { bulkEnrollSchema, parseIdentifiers } from "@/features/enrollment/schemas";
import {
  OFFERING_TRANSITIONS,
  canTransition,
  createOfferingSchema,
  offeringListQuerySchema,
} from "@/features/offerings/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("course schemas", () => {
  it("upper-cases and validates the code; rejects duplicates in majors", () => {
    const ok = createCourseSchema.parse({ code: "cs101", name: "مقدمة", majors: [{ majorId: uuid }] });
    expect(ok.code).toBe("CS101");
    expect(ok.creditHours).toBe(3);
    expect(ok.majors[0]?.isRequired).toBe(true);
    expect(() => createCourseSchema.parse({ code: "C", name: "x" })).toThrow();
    expect(() => createCourseSchema.parse({ code: "CS 101", name: "xx" })).toThrow();
    expect(() =>
      createCourseSchema.parse({ code: "CS101", name: "xx", majors: [{ majorId: uuid }, { majorId: uuid }] }),
    ).toThrow();
    expect(() => createCourseSchema.parse({ code: "CS101", name: "xx", creditHours: 13 })).toThrow();
  });
  it("list query defaults and urlBool", () => {
    expect(courseListQuerySchema.parse({})).toMatchObject({ q: "", status: "ALL", page: 1, pageSize: 20 });
    expect(urlBool.parse("false")).toBe(false);
    expect(urlBool.parse("true")).toBe(true);
    expect(urlBool.parse("0")).toBe(false);
    expect(offeringListQuerySchema.parse({ mine: "false" }).mine).toBe(false);
    expect(offeringListQuerySchema.parse({ mine: "1" }).mine).toBe(true);
  });
});

describe("offering schemas", () => {
  it("transition table is closed under ARCHIVED and symmetric OPEN⇄CLOSED", () => {
    expect(OFFERING_TRANSITIONS.ARCHIVED).toEqual([]);
    expect(canTransition("DRAFT", "OPEN")).toBe(true);
    expect(canTransition("OPEN", "CLOSED")).toBe(true);
    expect(canTransition("CLOSED", "OPEN")).toBe(true);
    expect(canTransition("OPEN", "ARCHIVED")).toBe(false);
    expect(canTransition("ARCHIVED", "OPEN")).toBe(false);
  });
  it("validates section, schedule, instructors", () => {
    const base = { courseId: uuid, semesterId: uuid2, section: "a" };
    expect(createOfferingSchema.parse(base)).toMatchObject({
      section: "A",
      status: "DRAFT",
      schedule: [],
      instructors: [],
    });
    expect(() => createOfferingSchema.parse({ ...base, section: "toolongsection" })).toThrow();
    expect(() =>
      createOfferingSchema.parse({
        ...base,
        schedule: [{ day: "SUN", startTime: "10:00", endTime: "09:00" }],
      }),
    ).toThrow();
    expect(
      createOfferingSchema.parse({
        ...base,
        schedule: [{ day: "SUN", startTime: "08:00", endTime: "09:40", room: "101" }],
      }).schedule,
    ).toHaveLength(1);
    expect(() =>
      createOfferingSchema.parse({ ...base, instructors: [{ userId: uuid }, { userId: uuid2 }] }),
    ).toThrow(); // two PRIMARY
    expect(
      createOfferingSchema.parse({
        ...base,
        instructors: [{ userId: uuid }, { userId: uuid2, role: "ASSISTANT" }],
      }).instructors,
    ).toHaveLength(2);
    expect(createOfferingSchema.parse({ ...base, capacity: "" }).capacity).toBeNull();
    expect(createOfferingSchema.parse({ ...base, capacity: "40" }).capacity).toBe(40);
    expect(() => createOfferingSchema.parse({ ...base, capacity: "0" })).toThrow();
  });
});

describe("enrollment identifiers", () => {
  it("splits on newlines/commas/semicolons/whitespace, lower-cases and dedupes", () => {
    expect(parseIdentifiers("443100002\n443100003, Student4@demo.edu ;443100002\t443100005")).toEqual([
      "443100002",
      "443100003",
      "student4@demo.edu",
      "443100005",
    ]);
    expect(parseIdentifiers("")).toEqual([]);
  });
  it("bulk schema enforces 1..500", () => {
    expect(() => bulkEnrollSchema.parse({ offeringId: uuid, identifiers: [] })).toThrow();
    expect(() =>
      bulkEnrollSchema.parse({
        offeringId: uuid,
        identifiers: Array.from({ length: 501 }, (_, i) => `x${i}`),
      }),
    ).toThrow();
    expect(bulkEnrollSchema.parse({ offeringId: uuid, identifiers: ["a"] }).identifiers).toEqual(["a"]);
  });
});
