import { defineConfig, devices } from "@playwright/test";

/**
 * E2E — runs against a production build (`pnpm build && pnpm start`) so RSC/proxy behave as in prod.
 * Desktop 1280×800 + iPhone 12 (390×844). Base host `localhost` resolves to the seeded `demo` tenant.
 * CI sets PLAYWRIGHT_BASE_URL / reuses the server started by the workflow.
 */
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // login-attempt rate limiting is per tenant/identifier
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-safari", use: { ...devices["iPhone 12"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm start -p " + PORT,
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
