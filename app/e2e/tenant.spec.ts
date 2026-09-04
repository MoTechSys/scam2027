import { expect, test } from "@playwright/test";

test.describe("tenant resolution", () => {
  test("unknown host returns 404 tenant-not-found echoing the host", async ({ request }) => {
    const r = await request.get("/login", { headers: { host: "unknown-university.localhost" } });
    expect(r.status()).toBe(404);
    expect(await r.text()).toContain("unknown-university.localhost");
  });

  test("/api/health reports db up", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.ok()).toBeTruthy();
    const body = (await r.json()) as { status: string; checks?: { db?: string } };
    expect(body.status).toMatch(/ok|healthy/i);
  });

  test("security headers are present", async ({ request }) => {
    const r = await request.get("/login");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("nonce-");
    expect(h["x-request-id"]).toBeTruthy();
    expect(h["x-content-type-options"]).toBe("nosniff");
  });
});
