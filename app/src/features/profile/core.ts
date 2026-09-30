/**
 * Profile core (P1-14) — transaction-level logic shared by actions, the avatar route and tests.
 * No `next/*` imports so vitest can load it.
 */
import "server-only";
import { audit } from "@/lib/audit";
import type { Ctx } from "@/lib/auth/rbac";
import type { TenantTx } from "@/lib/db/tenant";
import type { Theme, UpdateProfileInput } from "./schemas";

const nul = (v: string | undefined) => (v && v.length ? v : null);

export async function applyProfileUpdate(ctx: Ctx, t: TenantTx, data: UpdateProfileInput): Promise<void> {
  const before = await t.user.findUniqueOrThrow({
    where: { id: ctx.user.id },
    select: { name: true, phone: true, locale: true, profile: { select: { title: true, bio: true } } },
  });
  await t.user.update({
    where: { id: ctx.user.id },
    data: { name: data.name, phone: nul(data.phone), locale: data.locale },
  });
  await t.userProfile.upsert({
    where: { userId: ctx.user.id },
    create: { tenantId: ctx.tenantId, userId: ctx.user.id, title: nul(data.title), bio: nul(data.bio) },
    update: { title: nul(data.title), bio: nul(data.bio) },
  });
  await audit(
    ctx,
    {
      action: "profile.update",
      entity: "User",
      entityId: ctx.user.id,
      before: {
        name: before.name,
        phone: before.phone,
        locale: before.locale,
        title: before.profile?.title ?? null,
        bio: before.profile?.bio ?? null,
      },
      after: {
        name: data.name,
        phone: nul(data.phone),
        locale: data.locale,
        title: nul(data.title),
        bio: nul(data.bio),
      },
    },
    t,
  );
}

export async function applyTheme(ctx: Ctx, t: TenantTx, theme: Theme): Promise<void> {
  const prev = await t.userProfile.findUnique({ where: { userId: ctx.user.id }, select: { theme: true } });
  await t.userProfile.upsert({
    where: { userId: ctx.user.id },
    create: { tenantId: ctx.tenantId, userId: ctx.user.id, theme },
    update: { theme },
  });
  await audit(
    ctx,
    {
      action: "profile.theme",
      entity: "UserProfile",
      entityId: ctx.user.id,
      before: { theme: prev?.theme ?? "DARK" },
      after: { theme },
    },
    t,
  );
}

/** Persist a freshly uploaded avatar; returns the previous storage key so the caller can delete the old object. */
export async function applyAvatar(
  ctx: Ctx,
  t: TenantTx,
  next: { key: string; url: string; mime: string; size: number } | null,
): Promise<string | null> {
  const prev = await t.userProfile.findUnique({
    where: { userId: ctx.user.id },
    select: { avatarUrl: true, avatarStorageKey: true },
  });
  await t.userProfile.upsert({
    where: { userId: ctx.user.id },
    create: {
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      avatarUrl: next?.url ?? null,
      avatarStorageKey: next?.key ?? null,
    },
    update: { avatarUrl: next?.url ?? null, avatarStorageKey: next?.key ?? null },
  });
  await audit(
    ctx,
    {
      action: next ? "profile.avatar" : "profile.avatar_remove",
      entity: "UserProfile",
      entityId: ctx.user.id,
      before: { avatarUrl: prev?.avatarUrl ?? null },
      after: next ? { avatarUrl: next.url, mime: next.mime, size: next.size } : { avatarUrl: null },
    },
    t,
  );
  return prev?.avatarStorageKey ?? null;
}
