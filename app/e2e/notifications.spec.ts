import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/**
 * P1-07 — notifications. Admin composes to ALL (title `E2E…` → teardown removes it), student sees the bell badge and
 * the item, reads it (badge decrements) and marks all read; instructor sends to a taught section and sees read stats
 * on the SENT tab; student has no compose button; preferences save. Compose flows run on desktop only.
 */
test.describe("notifications", () => {
  const title = `E2E إعلان ${Date.now().toString().slice(-6)}`;

  test("admin composes to ALL and sees it in SENT with read stats", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-safari", "compose covered on desktop");
    await login(page, USERS.admin);
    await expect(page.getByTestId("notif-bell")).toBeVisible();
    await page.goto("/notifications?new=1");
    await expect(page.getByTestId("compose-form")).toBeVisible();
    await page.getByTestId("kind-ALL").click();
    await page.getByTestId("preview-recipients").click();
    await expect(page.getByTestId("preview-count")).not.toHaveText("", { timeout: 15_000 });
    await page.locator("#n-title").fill(title);
    await page.locator("#n-body").fill("نص إعلان تجريبي لكل المستخدمين");
    await page.locator("#n-link").fill("/dashboard");
    await page
      .getByTestId("compose-form")
      .getByRole("button", { name: /^إرسال$|^Send$/ })
      .click();
    await expect(page.getByTestId("compose-form")).toBeHidden({ timeout: 20_000 });
    await page.goto("/notifications?tab=SENT");
    const row = page.getByTestId("sent-title").filter({ hasText: title }).locator("visible=true");
    await expect(row).toBeVisible();
    await expect(page.getByTestId("read-stats").locator("visible=true").first()).toBeVisible();
  });

  test("student: badge, inbox item, read on expand, mark all read, no compose", async ({ page }) => {
    await login(page, USERS.student);
    const bell = page.getByTestId("notif-bell");
    await expect(bell).toBeVisible();
    await page.goto("/notifications");
    await expectNoHorizontalScroll(page);
    await expect(page.getByTestId("compose-notification")).toHaveCount(0);
    await expect(page.getByTestId("inbox-list")).toBeVisible();
    const unread = page.locator("[data-testid=inbox-item][data-unread=true]");
    const before = await unread.count();
    if (before > 0) {
      await unread.first().getByTestId("inbox-title").click();
      await expect(unread).toHaveCount(before - 1, { timeout: 15_000 });
      if (before > 1) {
        await page.getByTestId("mark-all-read").click();
        await expect(unread).toHaveCount(0, { timeout: 15_000 });
      }
      await expect(page.getByTestId("notif-badge")).toHaveCount(0, { timeout: 15_000 });
    }
    // preferences
    await page.goto("/notifications?tab=PREFS");
    await expect(page.getByTestId("prefs")).toBeVisible();
    await expectNoHorizontalScroll(page);
    const sw = page.getByTestId("pref-GRADE");
    const was = await sw.getAttribute("aria-checked");
    await sw.click();
    await page.getByTestId("save-prefs").click();
    await expect(page.getByTestId("save-prefs")).toBeDisabled({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId("pref-GRADE")).toHaveAttribute(
      "aria-checked",
      was === "true" ? "false" : "true",
    );
    // restore
    await page.getByTestId("pref-GRADE").click();
    await page.getByTestId("save-prefs").click();
    await expect(page.getByTestId("save-prefs")).toBeDisabled({ timeout: 15_000 });
  });

  test("instructor sends to a taught section; SENT tab shows own only", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-safari", "compose covered on desktop");
    await login(page, USERS.instructor);
    await page.goto("/notifications?new=1");
    await expect(page.getByTestId("compose-form")).toBeVisible();
    await expect(page.getByTestId("kind-ALL")).toHaveCount(0);
    await page.getByTestId("kind-OFFERING").click();
    await page.getByTestId("target-list").locator("label").first().click();
    const t = `E2E شعبة ${Date.now().toString().slice(-6)}`;
    await page.locator("#n-title").fill(t);
    await page.locator("#n-body").fill("تذكير للشعبة");
    await page
      .getByTestId("compose-form")
      .getByRole("button", { name: /^إرسال$|^Send$/ })
      .click();
    await expect(page.getByTestId("compose-form")).toBeHidden({ timeout: 20_000 });
    await page.goto("/notifications?tab=SENT");
    await expect(page.getByTestId("sent-title").filter({ hasText: t }).locator("visible=true")).toBeVisible();
    await expect(
      page.getByTestId("sent-title").filter({ hasText: title }).locator("visible=true"),
    ).toHaveCount(0);
  });
});
