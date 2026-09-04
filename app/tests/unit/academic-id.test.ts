import { describe, expect, it } from "vitest";
import { academicIdPrefix, renderAcademicId } from "@/features/users/academic-id";

describe("academic id format (FR-USR-002)", () => {
  it("renders default YYYY-NNNNN", () => {
    expect(renderAcademicId("YYYY-NNNNN", 2026, 7)).toBe("2026-00007");
    expect(academicIdPrefix("YYYY-NNNNN", 2026)).toBe("2026-");
  });
  it("supports YY and literal prefixes", () => {
    expect(renderAcademicId("STU-YYNNNN", 2026, 42)).toBe("STU-260042");
    expect(academicIdPrefix("STU-YYNNNN", 2026)).toBe("STU-26");
  });
  it("overflows width gracefully", () => {
    expect(renderAcademicId("YYYY-NNN", 2026, 1234)).toBe("2026-1234");
  });
});
