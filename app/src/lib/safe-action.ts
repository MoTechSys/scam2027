/**
 * safeAction — wraps a Server Action body so it always returns Result<T> (docs/30-architecture/04-API-CONTRACT.md).
 * Converts ZodError → VALIDATION (with fieldErrors), AppError → its code, unknown → INTERNAL (logged with requestId).
 */
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { AppError, failure, success, type Result } from "@/lib/result";

export async function safeAction<T>(fn: () => Promise<T>, meta?: { action?: string }): Promise<Result<T>> {
  try {
    return success(await fn());
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const k = issue.path.join(".") || "_";
        (fieldErrors[k] ??= []).push(issue.message);
      }
      return failure("VALIDATION", "بيانات غير صالحة", fieldErrors);
    }
    if (err instanceof AppError) return failure(err.code, err.message, err.fieldErrors);
    // Next.js redirect()/notFound() throw special errors that must propagate.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string"
    )
      throw err;
    logger.error({ err, action: meta?.action }, "action.unexpected");
    return failure("INTERNAL", "حدث خطأ غير متوقع، حاول لاحقاً");
  }
}
