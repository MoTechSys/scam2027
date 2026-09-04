/**
 * Audit trail — every mutating action writes one row (docs/30-architecture/03-AUTH-RBAC.md §6).
 * Never store secrets/passwords; use `redact()` on before/after.
 */
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import type { TenantTx } from "@/lib/db/tenant";
import { db } from "@/lib/db/tenant";

const SENSITIVE = new Set([
  "passwordHash",
  "password",
  "codeHash",
  "token",
  "secret",
  "encryptedKey",
  "apiKey",
]);

export function redact<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE.has(k)
      ? "[REDACTED]"
      : v && typeof v === "object" && !(v instanceof Date)
        ? redact(v)
        : v;
  }
  return out as T;
}

export type AuditInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function audit(ctx: Ctx, input: AuditInput, tx?: TenantTx): Promise<void> {
  const client = tx ?? db(ctx.tenantId);
  await client.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorId: ctx.user.id,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before === undefined ? undefined : (redact(input.before) as Prisma.InputJsonValue),
      after: input.after === undefined ? undefined : (redact(input.after) as Prisma.InputJsonValue),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    },
  });
}
