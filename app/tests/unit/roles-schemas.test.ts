import { describe, expect, it } from "vitest";
import { cloneRoleSchema, createRoleSchema, ROLE_CODE_RE, setRolePermissionsSchema } from "@/features/roles/schemas";

describe("roles schemas", () => {
  it("accepts a valid custom role and normalises code + dedupes permissions", () => {
    const r = createRoleSchema.parse({
      code: " librarian ",
      name: "أمين مكتبة",
      nameEn: "",
      description: "",
      permissionCodes: ["file.view", "file.view", "file.download"],
    });
    expect(r.code).toBe("LIBRARIAN");
    expect(r.permissionCodes).toEqual(["file.view", "file.download"]);
  });

  it("rejects unknown permission codes", () => {
    const r = createRoleSchema.safeParse({ code: "X_ROLE", name: "x", permissionCodes: ["nope.nothing"] });
    expect(r.success).toBe(false);
  });

  it.each(["AB", "1ABC", "has-dash", "a".repeat(41)])("rejects bad code %s", (code) => {
    expect(ROLE_CODE_RE.test(code.toUpperCase())).toBe(false);
  });

  it("setRolePermissions requires uuid id", () => {
    expect(setRolePermissionsSchema.safeParse({ id: "abc", permissionCodes: [] }).success).toBe(false);
    expect(setRolePermissionsSchema.safeParse({ id: "00000000-0000-4000-8000-000000000000", permissionCodes: [] }).success).toBe(true);
  });

  it("clone requires sourceId, code and name", () => {
    expect(cloneRoleSchema.safeParse({ sourceId: "00000000-0000-4000-8000-000000000000", code: "COPY_1", name: "نسخة" }).success).toBe(true);
    expect(cloneRoleSchema.safeParse({ sourceId: "x", code: "COPY_1", name: "نسخة" }).success).toBe(false);
  });
});
