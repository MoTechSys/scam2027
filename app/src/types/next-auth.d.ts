import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      tenantId: string;
      sessionId: string;
      mustChangePassword: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    tid?: string;
    sid?: string;
    sv?: number;
    mcp?: boolean;
  }
}
