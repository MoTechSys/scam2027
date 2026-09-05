import { describe, expect, it } from "vitest";
import { safeNext, toLoginErrorCode } from "@/lib/auth/login-errors";
import { visibleNavItems } from "@/lib/nav/items";

describe("safeNext (open-redirect guard)", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNext("/users?page=2")).toBe("/users?page=2");
  });
  it("falls back to /dashboard for anything unsafe", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/login",
      "/login?x=1",
      "javascript:alert(1)",
      "/a\r\nSet-Cookie: x",
    ])
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
    expect(keys).not.toContain("courses"); // shipped in P1-05 but course.view not granted here
    expect(keys).not.toContain("notifications"); // shipped in P1-07 but notification.view not granted here
    expect(keys).not.toContain("reports"); // still a future phase (P3)
  });
  it("shows roles when role.view is granted", () => {
    expect(visibleNavItems(new Set(["role.view"])).map((i) => i.key)).toContain("roles");
  });
  it("shows academic when academic.view is granted", () => {
    expect(visibleNavItems(new Set(["academic.view"])).map((i) => i.key)).toContain("academic");
  });
  it("shows courses/offerings when course.view / offering.view are granted (P1-05)", () => {
    const keys = visibleNavItems(new Set(["course.view", "offering.view"])).map((i) => i.key);
    expect(keys).toContain("courses");
    expect(keys).toContain("offerings");
  });
  it("shows notifications (bottom bar) when notification.view is granted (P1-07)", () => {
    const items = visibleNavItems(new Set(["notification.view"]));
    const n = items.find((i) => i.key === "notifications");
    expect(n?.href).toBe("/notifications");
    expect(n?.bottom).toBe(true);
  });
  it("shows files when file.view is granted (P1-06)", () => {
    const keys = visibleNavItems(new Set(["file.view"])).map((i) => i.key);
    expect(keys).toContain("files");
    expect(visibleNavItems(new Set(["course.view"])).map((i) => i.key)).not.toContain("files");
  });
  it("no permissions → only permission-free items", () => {
    expect(visibleNavItems(new Set()).map((i) => i.key)).toEqual(["developer"]);
  });
});
