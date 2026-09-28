import { expect, test, type Page } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, expectNoPageScroll, login } from "./helpers";

/**
 * Crawl gate (docs/50-quality/01-TESTING-STRATEGY.md §3.1, DoD "crawl"):
 * for every seeded role, every link the shell offers (sidebar / drawer / bottom bar) must:
 *  - answer 200 and stay on its own route (no /unauthorized, no 404),
 *  - render exactly one <h1> (ADR-0007: app bar owns it on mobile, PageHeader on desktop),
 *  - never scroll the document (ADR-0008) nor overflow horizontally at 390px,
 *  - produce zero page errors (hydration mismatches surface here as React #418/#423) and zero console errors.
 * Routes the shell hides (missing permission or unshipped `phase`) are also probed: they must redirect away, not 500.
 */

const ROLES = ["admin", "academic", "instructor", "student"] as const;

/** Every route registered in lib/nav/items.ts + detail-less public pages. */
const ALL_ROUTES = [
  "/dashboard",
  "/users",
  "/roles",
  "/academic",
  "/academic/years",
  "/academic/colleges",
  "/academic/departments",
  "/academic/majors",
  "/academic/levels",
  "/courses",
  "/offerings",
  "/files",
  "/notifications",
  "/trash",
  "/developer",
];

type Trace = { pageErrors: string[]; consoleErrors: string[] };

function trace(page: Page): Trace {
  const t: Trace = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (e) => t.pageErrors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // 404 for probed-but-unshipped routes is expected below; everything else is a defect.
    if (/the server responded with a status of 404/.test(text)) return;
    t.consoleErrors.push(text.slice(0, 200));
  });
  return t;
}

async function navLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('nav a[href^="/"], aside a[href^="/"]')]
      .map((a) => a.getAttribute("href")!)
      .filter((h, i, arr) => arr.indexOf(h) === i),
  );
}

for (const role of ROLES) {
  test.describe(`crawl as ${role}`, () => {
    test(`every shell link renders clean; hidden routes redirect`, async ({ page, isMobile }) => {
      const t = trace(page);
      await login(page, USERS[role]);

      // Links actually offered to this role (mobile: open the drawer to read the full menu).
      if (isMobile) await page.getByTestId("open-menu").click();
      const offered = await navLinks(page);
      if (isMobile) await page.keyboard.press("Escape");
      expect(offered, "shell must offer at least the dashboard").toContain("/dashboard");

      for (const href of offered) {
        const res = await page.goto(href, { waitUntil: "networkidle" });
        expect(res?.status(), `${role} ${href} status`).toBe(200);
        expect(new URL(page.url()).pathname, `${role} ${href} must not be redirected away`).toMatch(
          new RegExp(`^${href.replace(/\//g, "\\/")}`),
        );
        await expect(page.locator("h1"), `${role} ${href} needs exactly one h1`).toHaveCount(1);
        await expectNoHorizontalScroll(page);
        if (href !== "/developer") await expectNoPageScroll(page);
      }

      // Routes not offered to this role: the server guard must redirect (unauthorized) or 404 — never 500.
      const isOffered = (r: string) => offered.some((o) => r === o || r.startsWith(`${o}/`));
      for (const href of ALL_ROUTES.filter((r) => !isOffered(r))) {
        const res = await page.goto(href, { waitUntil: "networkidle" });
        const status = res?.status() ?? 0;
        const path = new URL(page.url()).pathname;
        expect(status, `${role} ${href} hidden route status`).toBeLessThan(500);
        if (status === 200) expect(path, `${role} ${href} must be redirected when hidden`).not.toBe(href);
      }

      expect(t.pageErrors, `${role}: page errors (hydration/runtime)`).toEqual([]);
      expect(t.consoleErrors, `${role}: console errors`).toEqual([]);
    });
  });
}

test("unauthenticated API calls get 401 JSON, not an HTML redirect", async ({ request }) => {
  for (const path of ["/api/notifications/unread-count", "/api/files/upload"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(401);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(await res.json()).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  }
  // Public health stays public.
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("CSP does not force https upgrades on plain-http hosts", async ({ request }) => {
  const csp = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp, "upgrade-insecure-requests only when x-forwarded-proto=https").not.toContain(
    "upgrade-insecure-requests",
  );
  const secure = (await request.get("/login", { headers: { "x-forwarded-proto": "https" } })).headers()[
    "content-security-policy"
  ];
  expect(secure).toContain("upgrade-insecure-requests");
});
