/** Profile read side (P1-14). Everything is the actor's own row — RLS + `id: ctx.user.id`. */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";
import { isTheme, type Theme } from "./schemas";

export type ProfileView = {
  name: string;
  email: string;
  academicId: string;
  phone: string | null;
  locale: string;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  theme: Theme;
  roles: string[];
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
};

export async function loadProfile(ctx: Ctx): Promise<ProfileView> {
  const u = await db(ctx.tenantId).user.findUniqueOrThrow({
    where: { id: ctx.user.id },
    select: {
      name: true,
      email: true,
      academicId: true,
      phone: true,
      locale: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      createdAt: true,
      profile: { select: { title: true, bio: true, avatarUrl: true, theme: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  return {
    name: u.name,
    email: u.email,
    academicId: u.academicId,
    phone: u.phone,
    locale: u.locale,
    title: u.profile?.title ?? null,
    bio: u.profile?.bio ?? null,
    avatarUrl: u.profile?.avatarUrl ?? null,
    theme: isTheme(u.profile?.theme) ? u.profile.theme : "DARK",
    roles: u.roles.map((r) => r.role.name),
    lastLoginAt: u.lastLoginAt,
    passwordChangedAt: u.passwordChangedAt,
    createdAt: u.createdAt,
  };
}

/** Theme + avatar for the shell (layout) — cheap, one row. */
export async function loadAppearance(ctx: Ctx): Promise<{ theme: Theme; avatarUrl: string | null }> {
  const p = await db(ctx.tenantId).userProfile.findUnique({
    where: { userId: ctx.user.id },
    select: { theme: true, avatarUrl: true },
  });
  return { theme: isTheme(p?.theme) ? p.theme : "DARK", avatarUrl: p?.avatarUrl ?? null };
}
