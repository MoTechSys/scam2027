import { describe, expect, it } from "vitest";
import { createUserSchema, userListQuerySchema } from "@/features/users/schemas";

describe("users schemas", () => {
  it("list query defaults and clamps", () => {
    const q = userListQuerySchema.parse({});
    expect(q).toMatchObject({ q: "", status: "ALL", page: 1, pageSize: 20, sort: "createdAt", dir: "desc" });
    expect(userListQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(userListQuerySchema.parse({ page: "3", status: "FROZEN" })).toMatchObject({ page: 3, status: "FROZEN" });
  });
  it("create requires a role and normalises email", () => {
    const r = createUserSchema.safeParse({ name: "x", email: " A@B.EDU ", roleIds: [] });
    expect(r.success).toBe(false);
    const ok = createUserSchema.parse({ name: "سارة", email: " A@B.EDU ", roleIds: ["3b241101-e2bb-4255-8caf-4136c566a962"] });
    expect(ok.email).toBe("a@b.edu");
    expect(ok.status).toBe("ACTIVE");
    expect(ok.mustChangePassword).toBe(true);
  });
  it("rejects academic ids with unsafe characters", () => {
    expect(createUserSchema.safeParse({ name: "x", email: "a@b.edu", roleIds: ["3b241101-e2bb-4255-8caf-4136c566a962"], academicId: "44 3;drop" }).success).toBe(false);
  });
});
