/**
 * Result<T> — the return type of every Server Action (docs/30-architecture/04-API-CONTRACT.md §1).
 * Never throw to the client; never leak internal messages.
 */
export const ErrorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "TENANT_SUSPENDED",
  "LOCKED",
  "INVALID_CREDENTIALS",
  "PASSWORD_CHANGE_REQUIRED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];

export type FieldErrors = Record<string, string[]>;

export type Success<T> = { ok: true; data: T };
export type Failure = { ok: false; code: ErrorCode; message: string; fieldErrors?: FieldErrors };
export type Result<T> = Success<T> | Failure;

export function success<T>(data: T): Success<T> {
  return { ok: true, data };
}

export function failure(code: ErrorCode, message: string, fieldErrors?: FieldErrors): Failure {
  return fieldErrors ? { ok: false, code, message, fieldErrors } : { ok: false, code, message };
}

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Error thrown by assert/require helpers and converted to a Failure by `safeAction`. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toFailure(err: unknown, fallback = "حدث خطأ غير متوقع"): Failure {
  if (err instanceof AppError) return failure(err.code, err.message, err.fieldErrors);
  return failure("INTERNAL", fallback);
}
