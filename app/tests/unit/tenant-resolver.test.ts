import { describe, expect, it } from "vitest";
import { hostToSlug } from "@/lib/auth/tenant-resolver";
import { safePrimaryColor } from "@/lib/tenant/current";

// .env: ROOT_DOMAIN=localhost, DEFAULT_TENANT_SLUG=demo
describe("hostToSlug", () => {
  it("subdomain → slug", () => {
    expect(hostToSlug("ksu.localhost:3000")).toEqual({ slug: "ksu", isRoot: false });
  });
  it("root / loopback → default tenant (dev)", () => {
    expect(hostToSlug("localhost:3000")).toEqual({ slug: "demo", isRoot: true });
    expect(hostToSlug("127.0.0.1")).toEqual({ slug: "demo", isRoot: true });
    expect(hostToSlug(null)).toEqual({ slug: "demo", isRoot: true });
  });
  it("nested subdomains and foreign hosts are not slugs (→ customDomain lookup)", () => {
    expect(hostToSlug("a.b.localhost")).toEqual({ slug: null, isRoot: false });
    expect(hostToSlug("lms.university.edu")).toEqual({ slug: null, isRoot: false });
    // sandbox/preview hosts (port-prefixed) must never be parsed as a tenant slug
    expect(hostToSlug("3000-abc123-2e77fc33.sandbox.novita.ai")).toEqual({ slug: null, isRoot: false });
  });
});

describe("safePrimaryColor (CSS injection guard)", () => {
  it("accepts only #rrggbb", () => {
    expect(safePrimaryColor("#39ff14")).toBe("#39ff14");
    expect(safePrimaryColor("#39FF14")).toBe("#39FF14");
    expect(safePrimaryColor("red")).toBeNull();
    expect(safePrimaryColor("#fff")).toBeNull();
    expect(safePrimaryColor("#39ff14; background:url(x)")).toBeNull();
    expect(safePrimaryColor(null)).toBeNull();
  });
});
