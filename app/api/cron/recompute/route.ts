import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { handleRouteError, jsonError } from "@/server/http";
import { runMaintenance } from "@/server/services/maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Scheduled maintenance endpoint for external schedulers (e.g. Vercel Cron every 15 min). */
async function run(req: Request) {
  try {
    if (!authorized(req)) return jsonError("Unauthorized", 401);
    return NextResponse.json({ ok: true, ...(await runMaintenance()) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export const GET = run;
export const POST = run;
