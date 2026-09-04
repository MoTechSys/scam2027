/**
 * Auth.js v5 configuration — docs/30-architecture/03-AUTH-RBAC.md §1
 *
 * Strategy: JWT cookie carrying { sid, uid, tid, sv } + server-side `Session` row (revocable).
 * requireUser() validates the Session row and `sessionVersion` on every server request, so revocation
 * and role changes take effect immediately (the JWT alone is never trusted for authorization).
 *
 * Credentials flow:
 *   identifier (email | academicId) + password + tenantId (from resolved host, never from the client body)
 *   → lockout check (5 fails / 15 min) → Argon2id verify → status check → Session row → JWT.
 */
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { verifyPassword } from "./password";

export const LOCKOUT_MAX_FAILS = 5;
export const LOCKOUT_WINDOW_MIN = 15;
export const SESSION_HOURS = 12;
export const SESSION_REMEMBER_DAYS = 30;

const credentialsSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
  tenantId: z.string().uuid(),
  remember: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export type AuthUserToken = {
  uid: string;
  tid: string;
  sid: string;
  sv: number;
  exp?: number;
};

export class AuthFailure extends Error {
  constructor(public readonly reason: "INVALID_CREDENTIALS" | "LOCKED" | "FROZEN" | "PENDING" | "DISABLED") {
    super(reason);
  }
}

export async function authenticateWithPassword(
  raw: unknown,
): Promise<AuthUserToken & { mustChangePassword: boolean }> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) throw new AuthFailure("INVALID_CREDENTIALS");
  const { identifier, password, tenantId, ip, userAgent } = parsed.data;
  const remember = parsed.data.remember === true || parsed.data.remember === "true";
  const prisma = db(tenantId);
  const identLower = identifier.toLowerCase();

  // Lockout window: count failures for this identifier in the last N minutes.
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);
  const recentFails = await prisma.loginAttempt.count({
    where: { tenantId, email: identLower, success: false, createdAt: { gte: since } },
  });
  if (recentFails >= LOCKOUT_MAX_FAILS) {
    await prisma.loginAttempt.create({
      data: { tenantId, email: identLower, success: false, reason: "LOCKED", ip, userAgent },
    });
    throw new AuthFailure("LOCKED");
  }

  const user = await prisma.user.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      OR: [{ email: identLower }, { academicId: identifier }],
    },
  });

  const ok = await verifyPassword(user?.passwordHash, password);
  if (!user || !ok || (user.lockedUntil && user.lockedUntil > new Date())) {
    await prisma.loginAttempt.create({
      data: {
        tenantId,
        email: identLower,
        userId: user?.id,
        success: false,
        reason: "INVALID_CREDENTIALS",
        ip,
        userAgent,
      },
    });
    if (user) {
      const fails = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: fails,
          lockedUntil: fails >= LOCKOUT_MAX_FAILS ? new Date(Date.now() + LOCKOUT_WINDOW_MIN * 60_000) : null,
        },
      });
      if (fails >= LOCKOUT_MAX_FAILS) {
        await prisma.auditLog.create({
          data: {
            tenantId,
            actorId: user.id,
            action: "auth.lockout",
            entity: "User",
            entityId: user.id,
            ip,
            userAgent,
          },
        });
      }
    }
    throw new AuthFailure("INVALID_CREDENTIALS");
  }

  if (user.status === "FROZEN") throw new AuthFailure("FROZEN");
  if (user.status === "DISABLED") throw new AuthFailure("DISABLED");
  if (user.status === "PENDING_ACTIVATION") throw new AuthFailure("PENDING");

  const expiresAt = new Date(
    Date.now() + (remember ? SESSION_REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000),
  );
  const [session] = await Promise.all([
    prisma.session.create({ data: { tenantId, userId: user.id, ip, userAgent, expiresAt } }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.loginAttempt.create({
      data: { tenantId, email: identLower, userId: user.id, success: true, reason: "OK", ip, userAgent },
    }),
    prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.id,
        action: "auth.login.success",
        entity: "User",
        entityId: user.id,
        ip,
        userAgent,
      },
    }),
  ]);

  logger.info({ tenantId, userId: user.id, sid: session.id }, "auth.login.success");
  return {
    uid: user.id,
    tid: tenantId,
    sid: session.id,
    sv: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
  };
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_REMEMBER_DAYS * 86_400 },
  pages: { signIn: "/login", error: "/login" },
  cookies: {
    sessionToken: {
      name: "scam.session",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        identifier: { label: "Email or Academic ID", type: "text" },
        password: { label: "Password", type: "password" },
        tenantId: { type: "text" },
        remember: { type: "text" },
      },
      async authorize(credentials, request) {
        const ip =
          request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers?.get("x-real-ip") ??
          undefined;
        const userAgent = request.headers?.get("user-agent") ?? undefined;
        try {
          const t = await authenticateWithPassword({ ...credentials, ip, userAgent });
          // Auth.js `User` shape: id + our claims on the object; we copy them into the JWT in the callback.
          return {
            id: t.uid,
            tid: t.tid,
            sid: t.sid,
            sv: t.sv,
            mustChangePassword: t.mustChangePassword,
          } as never;
        } catch (e) {
          if (e instanceof AuthFailure) {
            // Surface the reason to the login page through the error code (no user enumeration beyond LOCKED).
            throw new Error(e.reason);
          }
          logger.error({ err: e }, "auth.authorize.unexpected");
          throw new Error("INVALID_CREDENTIALS");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          tid: string;
          sid: string;
          sv: number;
          mustChangePassword: boolean;
        };
        token.uid = u.id;
        token.tid = u.tid;
        token.sid = u.sid;
        token.sv = u.sv;
        token.mcp = u.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      // Minimal, non-authoritative data for the client. Authorization always goes through requireUser().
      session.user = {
        ...session.user,
        id: String(token.uid ?? ""),
        tenantId: String(token.tid ?? ""),
        sessionId: String(token.sid ?? ""),
        mustChangePassword: Boolean(token.mcp),
      } as typeof session.user & { tenantId: string; sessionId: string; mustChangePassword: boolean };
      return session;
    },
  },
};
