import { describe, expect, it } from "vitest";
import { forwardedOrigin, normalizeForwardedHeaders, rebaseUrlToForwardedOrigin } from "@/lib/auth/forwarded";

const TUNNEL = "3000-abc123-2e77fc33.sandbox.novita.ai";

describe("normalizeForwardedHeaders", () => {
  it("copies host → x-forwarded-host and x-client-proto → x-forwarded-proto (sandbox tunnel shape)", () => {
    const h = new Headers({ host: TUNNEL, "x-client-proto": "https", "x-forwarded-port": "80" });
    normalizeForwardedHeaders(h);
    expect(h.get("x-forwarded-host")).toBe(TUNNEL);
    expect(h.get("x-forwarded-proto")).toBe("https");
  });

  it("never overrides values an upstream proxy already set", () => {
    const h = new Headers({
      host: "internal:3000",
      "x-forwarded-host": "demo.scam.edu",
      "x-forwarded-proto": "https",
      "x-client-proto": "http",
    });
    normalizeForwardedHeaders(h);
    expect(h.get("x-forwarded-host")).toBe("demo.scam.edu");
    expect(h.get("x-forwarded-proto")).toBe("https");
  });

  it("upgrades Next's default `http` when the tunnel says https, but never downgrades https", () => {
    const up = new Headers({ host: TUNNEL, "x-forwarded-proto": "http", "x-client-proto": "https" });
    normalizeForwardedHeaders(up);
    expect(up.get("x-forwarded-proto")).toBe("https");
    const keep = new Headers({ host: TUNNEL, "x-forwarded-proto": "https", "x-client-proto": "http" });
    normalizeForwardedHeaders(keep);
    expect(keep.get("x-forwarded-proto")).toBe("https");
  });

  it("ignores garbage scheme values", () => {
    const h = new Headers({ host: "localhost:3000", "x-client-proto": "gopher" });
    normalizeForwardedHeaders(h);
    expect(h.get("x-forwarded-proto")).toBeNull();
  });
});

describe("forwardedOrigin", () => {
  it("prefers x-forwarded-* and takes the first value of comma lists", () => {
    const h = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "demo.scam.edu, internal",
      "x-forwarded-proto": "https, http",
    });
    expect(forwardedOrigin(h)).toBe("https://demo.scam.edu");
  });

  it("lets a vendor https header win over a defaulted x-forwarded-proto=http", () => {
    const h = new Headers({ host: TUNNEL, "x-forwarded-proto": "http", "x-client-proto": "https" });
    expect(forwardedOrigin(h)).toBe(`https://${TUNNEL}`);
  });

  it("falls back to host + http for plain local requests", () => {
    expect(forwardedOrigin(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("returns null without a host or with an invalid host", () => {
    expect(forwardedOrigin(new Headers())).toBeNull();
    expect(forwardedOrigin(new Headers({ host: "evil host/with spaces" }))).toBeNull();
  });
});

describe("rebaseUrlToForwardedOrigin", () => {
  it("swaps only protocol+host, keeping path and query", () => {
    const h = new Headers({ host: TUNNEL, "x-client-proto": "https" });
    expect(rebaseUrlToForwardedOrigin("http://localhost:3000/api/auth/callback/credentials?x=1", h)).toBe(
      `https://${TUNNEL}/api/auth/callback/credentials?x=1`,
    );
  });

  it("leaves the URL untouched when the origin is unknown or the URL is invalid", () => {
    expect(rebaseUrlToForwardedOrigin("http://localhost:3000/a", new Headers())).toBe(
      "http://localhost:3000/a",
    );
    expect(rebaseUrlToForwardedOrigin("not a url", new Headers({ host: "x.test" }))).toBe("not a url");
  });
});
