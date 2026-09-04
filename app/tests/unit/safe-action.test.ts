import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";

describe("safeAction → Result<T>", () => {
  it("wraps success", async () => {
    expect(await safeAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });
  it("maps ZodError → VALIDATION with fieldErrors", async () => {
    const r = await safeAction(async () => z.object({ email: z.string().email() }).parse({ email: "nope" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("VALIDATION");
      expect(Object.keys(r.fieldErrors ?? {})).toEqual(["email"]);
    }
  });
  it("maps AppError → its code, keeps message", async () => {
    const r = await safeAction(async () => {
      throw new AppError("FORBIDDEN", "no");
    });
    expect(r).toEqual({ ok: false, code: "FORBIDDEN", message: "no" });
  });
  it("unknown errors → INTERNAL without leaking the message", async () => {
    const r = await safeAction(async () => {
      throw new Error("secret db string");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INTERNAL");
      expect(r.message).not.toContain("secret");
    }
  });
  it("re-throws Next.js control-flow errors (redirect/notFound)", async () => {
    const nextErr = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login" });
    await expect(
      safeAction(async () => {
        throw nextErr;
      }),
    ).rejects.toBe(nextErr);
  });
});
