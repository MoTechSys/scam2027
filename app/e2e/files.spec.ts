import { expect, test } from "@playwright/test";
import { USERS, expectNoHorizontalScroll, login } from "./helpers";

/**
 * P1-06 — files library. Admin uploads a text file through the real streaming endpoint, edits it, downloads it via a
 * signed link (200 + attachment), trashes and restores it. Instructor sees seeded CS101 files; student is read-only.
 * Uploaded rows are named `E2E*` so global teardown removes them.
 */
test.describe("files", () => {
  test("admin uploads, edits, downloads, trashes and restores a file", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-safari", "Radix Select flake on mobile — covered on desktop");
    test.setTimeout(120_000);
    await login(page, USERS.admin);
    const name = `E2E-notes-${Date.now().toString().slice(-6)}.txt`;

    await page.goto("/files");
    await page.getByTestId("upload-file").click();
    await expect(page.getByTestId("upload-form")).toBeVisible();
    await page
      .getByTestId("file-input")
      .setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("hello e2e") });
    await expect(page.getByTestId("upload-queue").locator("li")).toHaveCount(1);
    await page.getByTestId("start-upload").click();
    await expect(page.getByTestId("upload-form")).toBeHidden({ timeout: 20_000 });
    const link = (n: string) => page.getByTestId("file-link").filter({ hasText: n }).locator("visible=true");
    const row = link(name);
    await expect(row).toBeVisible();

    // rejected type never reaches the server
    await page.getByTestId("upload-file").click();
    await page.getByTestId("file-input").setInputFiles({
      name: "E2E-bad.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });
    await expect(page.getByTestId("upload-queue").locator("li[data-status=failed]")).toHaveCount(1);
    await expect(page.getByTestId("start-upload")).toBeDisabled();
    await page.getByTestId("close-upload").click();

    // download through the signed link → 200 attachment
    const [dl] = await Promise.all([page.waitForEvent("download"), row.click()]);
    expect(dl.suggestedFilename()).toContain("E2E-notes");

    // edit
    await page.getByRole("button", { name: `إجراءات: ${name}` }).click();
    await page.getByRole("menuitem", { name: /تعديل|Edit/ }).click();
    await page.locator("#file-name").fill(`${name.replace(".txt", "")}-renamed.txt`);
    await page
      .getByTestId("file-form")
      .getByRole("button", { name: /حفظ|Save/ })
      .click();
    await expect(page.getByTestId("file-form")).toBeHidden();
    const renamed = `${name.replace(".txt", "")}-renamed.txt`;
    await expect(link(renamed)).toBeVisible();

    // trash → restore
    await page.getByRole("button", { name: `إجراءات: ${renamed}` }).click();
    await page.getByRole("menuitem", { name: /^حذف$|^Delete$/ }).click();
    await page.getByRole("button", { name: /تأكيد|Confirm/ }).click();
    await expect(link(renamed)).toHaveCount(0);
    await page.goto("/files?tab=TRASH");
    await expect(link(renamed)).toBeVisible();
    await page.getByRole("button", { name: `إجراءات: ${renamed}` }).click();
    await page.getByRole("menuitem", { name: /استرجاع|Restore/ }).click();
    await expect(link(renamed)).toHaveCount(0);
    await page.goto("/files");
    await expect(link(renamed)).toBeVisible();
  });

  test("instructor sees seeded CS101 files and can upload; storage bar hidden", async ({ page }) => {
    await login(page, USERS.instructor);
    await page.goto("/files");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/ملفاتي|My files/);
    await expect(
      page
        .getByTestId("file-link")
        .filter({ hasText: /المحاضرة 1/ })
        .locator("visible=true"),
    ).toHaveCount(1);
    await expect(page.getByTestId("upload-file")).toBeVisible();
    await expect(page.getByTestId("storage-usage")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("student (CS101 s1) sees offering files read-only", async ({ page }) => {
    await login(page, USERS.student);
    await page.goto("/files");
    await expect(
      page
        .getByTestId("file-link")
        .filter({ hasText: /المحاضرة 1/ })
        .locator("visible=true"),
    ).toHaveCount(1);
    await expect(
      page
        .getByTestId("file-link")
        .filter({ hasText: /خطة المقرر/ })
        .locator("visible=true"),
    ).toHaveCount(1);
    await expect(page.getByTestId("upload-file")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    // unsigned direct download is refused
    const res = await page.request.get("/api/files/00000000-0000-0000-0000-000000000000/download");
    expect(res.status()).toBe(403);
  });
});
