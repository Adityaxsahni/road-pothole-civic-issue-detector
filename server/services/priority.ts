import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { boundingBox, haversineMeters, type LatLng } from "@/lib/geo";
import { computePriority, type PriorityResult } from "@/lib/scoring";
import { prisma } from "../db";

type Db = PrismaClient | Prisma.TransactionClient;

const DENSITY_RADIUS_M = 250;
const DENSITY_WINDOW_DAYS = 180;
const RISK_RADIUS_M = 500;
const RISK_WINDOW_DAYS = 365;

export interface ContextPoint extends LatLng {
  id: string;
  createdAt: Date;
  severity: string;
  duplicateOfId: string | null;
  status: string;
}

export interface HotspotArea {
  centerLat: number;
  centerLng: number;
  radius: number;
}

export interface PriorityContext {
  nearbyReportCount: number;
  nearbyHighSeverityRatio: number;
  inHotspot: boolean;
}

/** Pure context computation over preloaded points so batch recomputes avoid N+1 queries. */
export function contextFromPoints(
  target: LatLng & { id?: string },
  points: ContextPoint[],
  hotspots: HotspotArea[],
  asOf: Date = new Date(),
): PriorityContext {
  const now = asOf;
  const densityCutoff = now.getTime() - DENSITY_WINDOW_DAYS * 86_400_000;
  const riskCutoff = now.getTime() - RISK_WINDOW_DAYS * 86_400_000;
  let nearby = 0;
  let riskTotal = 0;
  let riskHigh = 0;
  for (const p of points) {
    if (p.id === target.id || (target.id && p.duplicateOfId === target.id)) continue;
    if (p.status === "REJECTED" || p.status === "DUPLICATE") continue;
    const t = p.createdAt.getTime();
    if (t > now.getTime()) continue;
    const d = haversineMeters(target, p);
    if (d <= DENSITY_RADIUS_M && t >= densityCutoff) nearby++;
    if (d <= RISK_RADIUS_M && t >= riskCutoff) {
      riskTotal++;
      if (p.severity === "HIGH" || p.severity === "CRITICAL") riskHigh++;
    }
  }
  const inHotspot = hotspots.some(
    (h) => haversineMeters(target, { latitude: h.centerLat, longitude: h.centerLng }) <= h.radius,
  );
  return {
    nearbyReportCount: nearby,
    nearbyHighSeverityRatio: riskTotal ? riskHigh / riskTotal : 0,
    inHotspot,
  };
}

export async function loadPriorityContext(
  db: Db,
  municipalityId: string,
  target: LatLng & { id?: string },
  asOf: Date = new Date(),
): Promise<PriorityContext> {
  const box = boundingBox(target, RISK_RADIUS_M);
  const since = new Date(asOf.getTime() - RISK_WINDOW_DAYS * 86_400_000);
  const [points, hotspots] = await Promise.all([
    db.report.findMany({
      where: {
        municipalityId,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        severity: true,
        duplicateOfId: true,
        status: true,
      },
    }),
    db.hotspotCluster.findMany({
      where: { municipalityId },
      select: { centerLat: true, centerLng: true, radius: true },
    }),
  ]);
  return contextFromPoints(target, points, hotspots, asOf);
}

/** Recalculate and persist one report's priority. Returns previous and new scores. */
export async function recomputeReportPriority(
  reportId: string,
  db: Db = prisma,
): Promise<{ previous: number; result: PriorityResult } | null> {
  const report = await db.report.findUnique({ where: { id: reportId }, include: { category: true } });
  if (!report) return null;
  const context = await loadPriorityContext(db, report.municipalityId, {
    id: report.id,
    latitude: report.latitude,
    longitude: report.longitude,
  });
  const isOpen = !["RESOLVED", "REJECTED", "DUPLICATE"].includes(report.status);
  const ageHours =
    ((isOpen ? Date.now() : (report.resolvedAt ?? report.updatedAt).getTime()) - report.createdAt.getTime()) /
    3_600_000;
  const result = computePriority({
    severityScore: report.severityScore,
    roadType: report.roadType,
    trafficLevel: report.trafficLevel,
    confidence: report.confidence,
    duplicateCount: report.duplicateCount,
    ageHours,
    slaHours: report.category.slaHours,
    ...context,
  });
  await db.report.update({
    where: { id: reportId },
    data: {
      priorityScore: result.score,
      priorityBreakdown: result.factors as unknown as Prisma.InputJsonValue,
    },
  });
  return { previous: report.priorityScore, result };
}

/** Batch recompute for every open report in a municipality (SLA pressure grows over time). */
export async function recomputeOpenPriorities(municipalityId: string): Promise<number> {
  const since = new Date(Date.now() - RISK_WINDOW_DAYS * 86_400_000);
  const [points, hotspots, open] = await Promise.all([
    prisma.report.findMany({
      where: { municipalityId, createdAt: { gte: since } },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        severity: true,
        duplicateOfId: true,
        status: true,
      },
    }),
    prisma.hotspotCluster.findMany({
      where: { municipalityId },
      select: { centerLat: true, centerLng: true, radius: true },
    }),
    prisma.report.findMany({
      where: { municipalityId, status: { in: ["NEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS"] } },
      include: { category: { select: { slaHours: true } } },
    }),
  ]);
  const now = new Date();
  const updates = open.map((r) => {
    const ctx = contextFromPoints(r, points, hotspots, now);
    const result = computePriority({
      severityScore: r.severityScore,
      roadType: r.roadType,
      trafficLevel: r.trafficLevel,
      confidence: r.confidence,
      duplicateCount: r.duplicateCount,
      ageHours: (now.getTime() - r.createdAt.getTime()) / 3_600_000,
      slaHours: r.category.slaHours,
      ...ctx,
    });
    return prisma.report.update({
      where: { id: r.id },
      data: {
        priorityScore: result.score,
        priorityBreakdown: result.factors as unknown as Prisma.InputJsonValue,
      },
    });
  });
  for (let i = 0; i < updates.length; i += 100) await prisma.$transaction(updates.slice(i, i + 100));
  return updates.length;
}
