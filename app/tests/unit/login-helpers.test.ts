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
    expect(keys).not.toContain("users"); // P1
    expect(keys).not.toContain("roles");
  });
  it("no permissions → only permission-free items", () => {
    expect(visibleNavItems(new Set()).map((i) => i.key)).toEqual(["developer"]);
  });
});
