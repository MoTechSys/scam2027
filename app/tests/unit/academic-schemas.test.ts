/**
 * Academic Zod schemas — codes, dates, cross-field rules, wizard payload, level naming (FR-ACD-001..006).
 */
import { describe, expect, it } from "vitest";
import {
  ACADEMIC_TABS,
  catalogueListQuerySchema,
  createCollegeSchema,
  createLevelSchema,
  createMajorSchema,
  createSemesterSchema,
  createYearSchema,
  generateLevelsSchema,
  levelName,
  MAX_LEVELS,
  setupWizardSchema,
  updateSemesterSchema,
} from "@/features/academic/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.path.join(".")));

describe("academic year", () => {
  it("normalises code and converts ISO dates to UTC midnight", () => {
    const y = createYearSchema.parse({ code: " 2026/2027 ", name: "العام 2026", startDate: "2026-09-01", endDate: "2027-07-31" });
    expect(y.code).toBe("2026/2027");
    expect(y.startDate.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(y.isCurrent).toBe(false);
  });
  it("rejects end ≤ start on endDate", () => {
    const r = createYearSchema.safeParse({ code: "Y", name: "سنة", startDate: "2026-09-01", endDate: "2026-09-01" });
    expect(paths(r)).toEqual(["endDate"]);
  });
  it("rejects bad codes (lowercase is upper-cased first; spaces / arabic are not)", () => {
    expect(createYearSchema.safeParse({ code: "ab-1", name: "سنة", startDate: "2026-01-01", endDate: "2026-12-31" }).success).toBe(true);
    expect(paths(createYearSchema.safeParse({ code: "سنة", name: "سنة", startDate: "2026-01-01", endDate: "2026-12-31" }))).toEqual(["code"]);
    expect(paths(createYearSchema.safeParse({ code: "A B", name: "سنة", startDate: "2026-01-01", endDate: "2026-12-31" }))).toEqual(["code"]);
    expect(paths(createYearSchema.safeParse({ code: "A".repeat(21), name: "سنة", startDate: "2026-01-01", endDate: "2026-12-31" }))).toEqual(["code"]);
  });
  it("rejects malformed date strings", () => {
    expect(paths(createYearSchema.safeParse({ code: "Y", name: "سنة", startDate: "01/09/2026", endDate: "2027-07-31" }))).toContain("startDate");
    expect(paths(createYearSchema.safeParse({ code: "Y", name: "سنة", startDate: "2026-13-45", endDate: "2027-07-31" }))).toContain("startDate");
  });
});

describe("semester", () => {
  const base = { academicYearId: uuid, term: "FIRST", name: "الفصل الأول", startDate: "2026-09-01", endDate: "2027-01-31" };
  it("defaults status to PLANNED and allows null registration window", () => {
    const s = createSemesterSchema.parse({ ...base, registrationOpensAt: null, registrationClosesAt: null });
    expect(s.status).toBe("PLANNED");
    expect(s.registrationOpensAt).toBeNull();
  });
  it("registration close must be after open", () => {
    expect(paths(createSemesterSchema.safeParse({ ...base, registrationOpensAt: "2026-09-10", registrationClosesAt: "2026-09-01" }))).toEqual(["registrationClosesAt"]);
  });
  it("update variant drops academicYearId and requires id", () => {
    const r = updateSemesterSchema.safeParse({ ...base, id: uuid });
    expect(r.success).toBe(true);
    expect(r.success && "academicYearId" in r.data).toBe(false);
    expect(paths(updateSemesterSchema.safeParse(base))).toEqual(["id"]);
  });
  it("rejects unknown term / status", () => {
    expect(paths(createSemesterSchema.safeParse({ ...base, term: "THIRD" }))).toEqual(["term"]);
    expect(paths(createSemesterSchema.safeParse({ ...base, status: "OPEN" }))).toEqual(["status"]);
  });
});

describe("catalogue entities", () => {
  it("college: coerces sortOrder, defaults isActive, allows empty optional strings", () => {
    const c = createCollegeSchema.parse({ code: "ccis", name: "كلية الحاسب", nameEn: "", description: "", sortOrder: "3" });
    expect(c).toMatchObject({ code: "CCIS", sortOrder: 3, isActive: true, nameEn: "" });
  });
  it("major: degree default + durationYears range", () => {
    expect(createMajorSchema.parse({ code: "CS", name: "علوم الحاسب", departmentId: uuid }).degree).toBe("BACHELOR");
    expect(paths(createMajorSchema.safeParse({ code: "CS", name: "علوم الحاسب", departmentId: uuid, durationYears: 11 }))).toEqual(["durationYears"]);
    expect(paths(createMajorSchema.safeParse({ code: "CS", name: "علوم الحاسب", departmentId: "x" }))).toEqual(["departmentId"]);
  });
  it("level: number 1..MAX_LEVELS, coerced from string", () => {
    expect(createLevelSchema.parse({ majorId: uuid, number: "7", name: "المستوى السابع" }).number).toBe(7);
    expect(paths(createLevelSchema.safeParse({ majorId: uuid, number: 0, name: "م" }))).toEqual(expect.arrayContaining(["number", "name"]));
    expect(paths(createLevelSchema.safeParse({ majorId: uuid, number: MAX_LEVELS + 1, name: "المستوى" }))).toEqual(["number"]);
    expect(paths(generateLevelsSchema.safeParse({ majorId: uuid, count: 0 }))).toEqual(["count"]);
  });
  it("name length bounds", () => {
    expect(paths(createCollegeSchema.safeParse({ code: "A", name: "أ" }))).toEqual(["name"]);
    expect(paths(createCollegeSchema.safeParse({ code: "A", name: "أ".repeat(121) }))).toEqual(["name"]);
  });
});

describe("setup wizard", () => {
  const valid = {
    year: { code: "2026/2027", name: "العام الأكاديمي", startDate: "2026-09-01", endDate: "2027-07-31" },
    semester: { term: "FIRST", name: "الفصل الأول", startDate: "2026-09-01", endDate: "2027-01-31" },
    college: { code: "CCIS", name: "كلية الحاسب" },
    department: { code: "CS", name: "قسم الحاسب" },
    major: { code: "CS-BSC", name: "علوم الحاسب" },
  };
  it("parses a minimal payload with defaults (levelCount 8, BACHELOR)", () => {
    const w = setupWizardSchema.parse(valid);
    expect(w.levelCount).toBe(8);
    expect(w.major.degree).toBe("BACHELOR");
    expect(w.semester.status).toBe("PLANNED");
  });
  it("reports nested paths so the wizard can jump to the failing step", () => {
    const r = setupWizardSchema.safeParse({ ...valid, semester: { ...valid.semester, endDate: "2026-09-01" }, department: { code: "CS", name: "x" }, levelCount: 99 });
    expect(paths(r)).toEqual(expect.arrayContaining(["semester.endDate", "department.name", "levelCount"]));
  });
});

describe("misc", () => {
  it("tabs are stable URL segments", () => {
    expect(ACADEMIC_TABS).toEqual(["years", "colleges", "departments", "majors", "levels"]);
  });
  it("list query defaults + parentId must be a uuid", () => {
    expect(catalogueListQuerySchema.parse({})).toEqual({ q: "", includeInactive: true });
    expect(catalogueListQuerySchema.safeParse({ parentId: "nope" }).success).toBe(false);
    expect(catalogueListQuerySchema.parse({ parentId: uuid, q: "  cs " }).q).toBe("cs");
  });
  it("includeInactive parses URL strings correctly (\"false\" is false)", () => {
    expect(catalogueListQuerySchema.parse({ includeInactive: "false" }).includeInactive).toBe(false);
    expect(catalogueListQuerySchema.parse({ includeInactive: "0" }).includeInactive).toBe(false);
    expect(catalogueListQuerySchema.parse({ includeInactive: "true" }).includeInactive).toBe(true);
    expect(catalogueListQuerySchema.parse({ includeInactive: false }).includeInactive).toBe(false);
    expect(catalogueListQuerySchema.safeParse({ includeInactive: "maybe" }).success).toBe(false);
  });
  it("levelName gives Arabic ordinals up to 20 and a numeric fallback beyond", () => {
    expect(levelName(1)).toEqual({ name: "المستوى الأول", nameEn: "Level 1" });
    expect(levelName(20).name).toBe("المستوى العشرون");
    expect(levelName(21).name).toBe("المستوى 21");
  });
});
