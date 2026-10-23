import "server-only";
import { buildHotspots } from "@/lib/clustering";
import { nearestNeighborhood } from "@/lib/geo";
import { prisma } from "../db";

const WINDOW_DAYS = 180;
export const HOTSPOT_EPS_M = 200;
export const HOTSPOT_MIN_POINTS = 3;

/**
 * Rebuild the ranked hotspot clusters for a municipality from unique (non-duplicate) reports
 * filed in the last 180 days. Clusters are replaced atomically.
 */
export async function recomputeHotspots(municipalityId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [reports, neighborhoods, categories] = await Promise.all([
    prisma.report.findMany({
      where: { municipalityId, createdAt: { gte: since }, status: { notIn: ["REJECTED", "DUPLICATE"] } },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        severityScore: true,
        status: true,
        category: { select: { slug: true } },
      },
    }),
    prisma.neighborhood.findMany({ where: { municipalityId } }),
    prisma.issueCategory.findMany({ select: { id: true, slug: true, name: true } }),
  ]);

  const hotspots = buildHotspots(
    reports.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      severityScore: r.severityScore,
      open: r.status !== "RESOLVED",
      categorySlug: r.category.slug,
    })),
    HOTSPOT_EPS_M,
    HOTSPOT_MIN_POINTS,
  );

  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const rows = hotspots.map((h, i) => {
    const hood = nearestNeighborhood({ latitude: h.centerLat, longitude: h.centerLng }, neighborhoods);
    const category = bySlug.get(h.dominantCategory);
    return {
      municipalityId,
      neighborhoodId: hood?.id ?? null,
      dominantCategoryId: category?.id ?? null,
      label: `${hood?.name ?? "Unmapped area"} · ${category?.name ?? "Mixed issues"}`,
      rank: i + 1,
      centerLat: h.centerLat,
      centerLng: h.centerLng,
      radius: h.radius,
      issueCount: h.issueCount,
      openCount: h.openCount,
      severityScore: h.severityScore,
      riskScore: h.riskScore,
      recommendedAction: h.recommendedAction,
      reportIds: h.reportIds,
    };
  });

  await prisma.$transaction([
    prisma.hotspotCluster.deleteMany({ where: { municipalityId } }),
    prisma.hotspotCluster.createMany({ data: rows }),
  ]);
  return rows.length;
}

const timers = new Map<string, NodeJS.Timeout>();

/**
 * Debounced background recompute after new reports. On serverless platforms where timers may
 * not survive the request, the /api/cron/recompute job keeps clusters fresh.
 */
export function scheduleHotspotRecompute(municipalityId: string, delayMs = 4000) {
  clearTimeout(timers.get(municipalityId));
  timers.set(
    municipalityId,
    setTimeout(() => {
      timers.delete(municipalityId);
      recomputeHotspots(municipalityId).catch((err) => console.error("[hotspots] recompute failed", err));
    }, delayMs),
  );
}
