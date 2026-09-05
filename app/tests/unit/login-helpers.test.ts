import { describe, expect, it } from "vitest";
import { safeNext, toLoginErrorCode } from "@/lib/auth/login-errors";
import { visibleNavItems } from "@/lib/nav/items";

describe("safeNext (open-redirect guard)", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNext("/users?page=2")).toBe("/users?page=2");
  });
  it("falls back to /dashboard for anything unsafe", () => {
    for (const bad of [undefined, null, "", "https://evil.example", "//evil.example", "/login", "/login?x=1", "javascript:alert(1)", "/a\r\nSet-Cookie: x"])
      expect(safeNext(bad)).toBe("/dashboard");
  });
});

describe("toLoginErrorCode", () => {
  it("passes through known reasons and hides unknown ones", () => {
    expect(toLoginErrorCode("LOCKED")).toBe("LOCKED");
    expect(toLoginErrorCode("FROZEN")).toBe("FROZEN");
    expect(toLoginErrorCode("PrismaClientKnownRequestError: ...")).toBe("INVALID_CREDENTIALS");
    expect(toLoginErrorCode(undefined)).toBe("INVALID_CREDENTIALS");
  });
});

describe("visibleNavItems", () => {
  it("hides future-phase routes and unpermitted items; keeps public items", () => {
    const items = visibleNavItems(new Set(["dashboard.view", "user.view"]));
    const keys = items.map((i) => i.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("developer");
    expect(keys).toContain("users"); // shipped in P1-02 and permitted
    expect(keys).not.toContain("roles"); // shipped in P1-03 but role.view not granted here
    expect(keys).not.toContain("academic"); // shipped in P1-04 but academic.view not granted here
    expect(keys).not.toContain("courses"); // still a future phase
  });
  it("shows roles when role.view is granted", () => {
    expect(visibleNavItems(new Set(["role.view"])).map((i) => i.key)).toContain("roles");
  });
  it("shows academic when academic.view is granted", () => {
    expect(visibleNavItems(new Set(["academic.view"])).map((i) => i.key)).toContain("academic");
  });
  it("no permissions → only permission-free items", () => {
    expect(visibleNavItems(new Set()).map((i) => i.key)).toEqual(["developer"]);
  });
});
