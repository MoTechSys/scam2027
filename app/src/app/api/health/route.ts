/**
 * GET /api/health — FR-SYS-003. Public, tenant-free. Never leaks secrets or hostnames.
 * 200 { status: "ok" } when DB reachable; 503 { status: "degraded" } otherwise.
 */
import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  let db: "up" | "down" = "down";
  try {
    await basePrisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch {
    db = "down";
  }
  const body = {
    status: db === "up" ? "ok" : "degraded",
    version: process.env.npm_package_version ?? "0.1.0",
    checks: { db, latencyMs: Date.now() - startedAt },
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: db === "up" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
