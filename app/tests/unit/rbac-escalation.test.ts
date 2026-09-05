/**
 * Privilege-escalation guard (FR-ROL-006): an actor may manage/grant only permission sets whose *escalating*
 * codes are a subset of their own. Self-scope codes (quiz.take, assignment.submit, grade.view_own) are ignored,
 * otherwise a TENANT_ADMIN could never manage a STUDENT.
 */
import { describe, expect, it } from "vitest";
import { SYSTEM_ROLE_GRANTS, type PermissionCode, type SystemRoleCode } from "@/lib/auth/permissions";
import { canManagePermissionSet } from "@/lib/auth/permissions";

const grants = (role: SystemRoleCode) => new Set(Object.keys(SYSTEM_ROLE_GRANTS[role]) as PermissionCode[]);

describe("canManagePermissionSet", () => {
  it("TENANT_ADMIN can manage every system role", () => {
    const admin = grants("TENANT_ADMIN");
    for (const r of ["ACADEMIC_ADMIN", "INSTRUCTOR", "STUDENT", "TENANT_ADMIN"] as const)
      expect(canManagePermissionSet(admin, grants(r)), r).toBe(true);
  });

  it("ACADEMIC_ADMIN can manage STUDENT (self-scope only) but not INSTRUCTOR (teaching codes) nor TENANT_ADMIN", () => {
    const academic = grants("ACADEMIC_ADMIN");
    expect(canManagePermissionSet(academic, grants("STUDENT"))).toBe(true);
    // Per 02-PERMISSIONS-MATRIX: ACADEMIC_ADMIN lacks quiz.create/grade.edit/... so it cannot grant INSTRUCTOR.
    expect(canManagePermissionSet(academic, grants("INSTRUCTOR"))).toBe(false);
    expect(canManagePermissionSet(academic, grants("TENANT_ADMIN"))).toBe(false);
  });

  it("STUDENT cannot manage anyone with admin codes", () => {
    const student = grants("STUDENT");
    expect(canManagePermissionSet(student, grants("INSTRUCTOR"))).toBe(false);
    expect(canManagePermissionSet(student, ["user.create"])).toBe(false);
  });

  it("unknown permission codes are never manageable", () => {
    expect(canManagePermissionSet(grants("TENANT_ADMIN"), ["not.a.permission"])).toBe(false);
  });
});
