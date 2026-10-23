import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { handleRouteError, jsonError } from "@/server/http";
import { snapshotDays } from "@/server/services/analytics";
import { recomputeHotspots } from "@/server/services/hotspots";
import { recomputeOpenPriorities } from "@/server/services/priority";

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

/**
 * Scheduled maintenance (e.g. Vercel Cron every 15 min, or any scheduler):
 * hotspot clustering → priority refresh (SLA pressure grows with age) → daily analytics snapshot.
 */
async function run(req: Request) {
  try {
    if (!authorized(req)) return jsonError("Unauthorized", 401);
    const municipalities = await prisma.municipality.findMany({ select: { id: true, slug: true } });
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const results = [];
    for (const m of municipalities) {
      const hotspots = await recomputeHotspots(m.id);
      const priorities = await recomputeOpenPriorities(m.id);
      await snapshotDays(m.id, [yesterday, today]);
      results.push({ municipality: m.slug, hotspots, priorities });
    }
    return NextResponse.json({ ok: true, ranAt: today.toISOString(), results });
  } catch (err) {
    return handleRouteError(err);
  }
}

export const GET = run;
export const POST = run;
