import "server-only";
import { prisma } from "../db";
import { snapshotDays } from "./analytics";
import { recomputeHotspots } from "./hotspots";
import { recomputeOpenPriorities } from "./priority";

export interface MaintenanceResult {
  ranAt: string;
  results: Array<{ municipality: string; hotspots: number; priorities: number }>;
}

/**
 * Periodic upkeep for every municipality: hotspot clustering → priority refresh (SLA pressure
 * grows with age) → daily analytics snapshot. Triggered by /api/cron/recompute or the
 * in-process scheduler (server/scheduler.ts).
 */
export async function runMaintenance(): Promise<MaintenanceResult> {
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
  return { ranAt: today.toISOString(), results };
}
