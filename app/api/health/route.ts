import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for containers and uptime monitors. */
export async function GET() {
  const started = Date.now();
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }
  const ai = env().AI_SERVICE_URL ? "remote" : "builtin";
  const ok = database === "ok";
  return NextResponse.json({ ok, database, ai, latencyMs: Date.now() - started }, { status: ok ? 200 : 503 });
}
