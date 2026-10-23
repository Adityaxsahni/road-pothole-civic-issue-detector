import "server-only";
import type { Prisma } from "@prisma/client";
import { findRepeatZones, startOfUtcDay, summarizeDay } from "@/lib/analytics";
import { OPEN_STATUSES } from "@/lib/constants";
import { prisma } from "../db";
import { reportListSelect } from "./queries";

const UNIQUE: Prisma.ReportWhereInput = { dedupStatus: { not: "DUPLICATE" }, status: { not: "REJECTED" } };

export async function getOverviewStats(municipalityId: string) {
  const now = Date.now();
  const d7 = new Date(now - 7 * 86_400_000);
  const d14 = new Date(now - 14 * 86_400_000);
  const base = { municipalityId };
  const [total, unique, open, resolved, criticalOpen, merged, suspected, last7, prev7, openForSla, avgRes] =
    await Promise.all([
      prisma.report.count({ where: base }),
      prisma.report.count({ where: { ...base, ...UNIQUE } }),
      prisma.report.count({ where: { ...base, status: { in: OPEN_STATUSES } } }),
      prisma.report.count({ where: { ...base, status: "RESOLVED" } }),
      prisma.report.count({ where: { ...base, status: { in: OPEN_STATUSES }, severity: "CRITICAL" } }),
      prisma.report.count({ where: { ...base, dedupStatus: "DUPLICATE" } }),
      prisma.report.count({ where: { ...base, dedupStatus: "SUSPECTED", status: { in: OPEN_STATUSES } } }),
      prisma.report.count({ where: { ...base, createdAt: { gte: d7 } } }),
      prisma.report.count({ where: { ...base, createdAt: { gte: d14, lt: d7 } } }),
      prisma.report.findMany({
        where: { ...base, status: { in: OPEN_STATUSES } },
        select: { createdAt: true, category: { select: { slaHours: true } } },
      }),
      prisma.$queryRaw<Array<{ hours: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600)::float AS hours
        FROM "Report"
        WHERE "municipalityId" = ${municipalityId} AND status = 'RESOLVED'
          AND "resolvedAt" >= NOW() - INTERVAL '90 days'`,
    ]);
  const slaBreaches = openForSla.filter(
    (r) => now - r.createdAt.getTime() > r.category.slaHours * 3_600_000,
  ).length;
  return {
    total,
    unique,
    open,
    resolved,
    criticalOpen,
    merged,
    suspected,
    last7,
    prev7,
    slaBreaches,
    resolutionRate: resolved + open ? resolved / (resolved + open) : 0,
    avgResolutionHours: avgRes[0]?.hours ?? null,
  };
}

export type OverviewStats = Awaited<ReturnType<typeof getOverviewStats>>;

export async function getPriorityQueue(municipalityId: string, take = 8) {
  return prisma.report.findMany({
    where: { municipalityId, status: { in: OPEN_STATUSES }, dedupStatus: { not: "DUPLICATE" } },
    orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
    take,
    select: reportListSelect,
  });
}

export async function getRecentReports(municipalityId: string, take = 8) {
  return prisma.report.findMany({
    where: { municipalityId },
    orderBy: { createdAt: "desc" },
    take,
    select: reportListSelect,
  });
}

export async function getCategoryBreakdown(municipalityId: string) {
  const [all, open, categories] = await Promise.all([
    prisma.report.groupBy({
      by: ["categoryId"],
      where: { municipalityId, ...UNIQUE },
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ["categoryId"],
      where: { municipalityId, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    }),
    prisma.issueCategory.findMany({ select: { id: true, name: true, slug: true, color: true } }),
  ]);
  const openBy = new Map(open.map((o) => [o.categoryId, o._count._all]));
  return all
    .map((row) => {
      const c = categories.find((x) => x.id === row.categoryId)!;
      return {
        slug: c.slug,
        name: c.name,
        color: c.color,
        total: row._count._all,
        open: openBy.get(row.categoryId) ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export async function getSeverityDistribution(municipalityId: string) {
  const rows = await prisma.report.groupBy({
    by: ["severity"],
    where: { municipalityId, status: { in: OPEN_STATUSES } },
    _count: { _all: true },
  });
  const by = Object.fromEntries(rows.map((r) => [r.severity, r._count._all]));
  return (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((severity) => ({
    severity,
    count: by[severity] ?? 0,
  }));
}

/** Unique issues per lifecycle stage (the maintenance pipeline). */
export async function getStatusBreakdown(municipalityId: string) {
  const rows = await prisma.report.groupBy({
    by: ["status"],
    where: { municipalityId, ...UNIQUE },
    _count: { _all: true },
  });
  const by = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return (["NEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"] as const).map((status) => ({
    status,
    count: by[status] ?? 0,
  }));
}

export async function getWeeklyTrend(municipalityId: string, weeks = 12) {
  const start = startOfUtcDay(new Date(Date.now() - weeks * 7 * 86_400_000));
  const [created, resolved] = await Promise.all([
    prisma.$queryRaw<Array<{ week: Date; count: number }>>`
      SELECT date_trunc('week', "createdAt") AS week, COUNT(*)::int AS count FROM "Report"
      WHERE "municipalityId" = ${municipalityId} AND "createdAt" >= ${start} AND "dedupStatus" <> 'DUPLICATE'
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ week: Date; count: number }>>`
      SELECT date_trunc('week', "resolvedAt") AS week, COUNT(*)::int AS count FROM "Report"
      WHERE "municipalityId" = ${municipalityId} AND "resolvedAt" >= ${start} AND status = 'RESOLVED'
      GROUP BY 1`,
  ]);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const createdBy = new Map(created.map((r) => [key(r.week), r.count]));
  const resolvedBy = new Map(resolved.map((r) => [key(r.week), r.count]));
  // Postgres weeks start on Monday; build a continuous series so empty weeks show as zero.
  const firstMonday = new Date(start);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7));
  const series: Array<{ week: string; created: number; resolved: number }> = [];
  for (let t = firstMonday.getTime(); t <= Date.now(); t += 7 * 86_400_000) {
    const k = key(new Date(t));
    series.push({ week: k, created: createdBy.get(k) ?? 0, resolved: resolvedBy.get(k) ?? 0 });
  }
  return series;
}

export async function getNeighborhoodStats(municipalityId: string) {
  const [rows, neighborhoods, hotspots] = await Promise.all([
    prisma.report.groupBy({
      by: ["neighborhoodId", "status"],
      where: { municipalityId, ...UNIQUE },
      _count: { _all: true },
      _avg: { severityScore: true },
    }),
    prisma.neighborhood.findMany({ where: { municipalityId }, select: { id: true, name: true } }),
    prisma.hotspotCluster.groupBy({
      by: ["neighborhoodId"],
      where: { municipalityId },
      _count: { _all: true },
      _max: { riskScore: true },
    }),
  ]);
  type Row = {
    id: string;
    name: string;
    open: number;
    resolved: number;
    count: number;
    hotspots: number;
    maxRisk: number;
  };
  const stats = new Map<string, Row & { severitySum: number }>();
  for (const n of neighborhoods) {
    stats.set(n.id, {
      id: n.id,
      name: n.name,
      open: 0,
      resolved: 0,
      count: 0,
      hotspots: 0,
      maxRisk: 0,
      severitySum: 0,
    });
  }
  for (const r of rows) {
    const s = r.neighborhoodId ? stats.get(r.neighborhoodId) : undefined;
    if (!s) continue;
    if (r.status === "RESOLVED") s.resolved += r._count._all;
    else s.open += r._count._all;
    s.count += r._count._all;
    s.severitySum += (r._avg.severityScore ?? 0) * r._count._all;
  }
  for (const h of hotspots) {
    const s = h.neighborhoodId ? stats.get(h.neighborhoodId) : undefined;
    if (s) {
      s.hotspots = h._count._all;
      s.maxRisk = h._max.riskScore ?? 0;
    }
  }
  return [...stats.values()]
    .map(({ severitySum, ...s }) => ({ ...s, avgSeverity: s.count ? severitySum / s.count : 0 }))
    .sort((a, b) => b.open - a.open || b.count - a.count);
}

export async function getHotspots(municipalityId: string, take = 10) {
  return prisma.hotspotCluster.findMany({
    where: { municipalityId },
    orderBy: { rank: "asc" },
    take,
    include: {
      neighborhood: { select: { name: true } },
      dominantCategory: { select: { name: true, slug: true } },
    },
  });
}

export async function getRepeatZones(municipalityId: string, take = 8) {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const reports = await prisma.report.findMany({
    where: { municipalityId, createdAt: { gte: since }, ...UNIQUE },
    select: {
      id: true,
      refCode: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      resolvedAt: true,
      category: { select: { group: true, name: true } },
      neighborhood: { select: { name: true } },
    },
  });
  const zones = findRepeatZones(
    reports.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      categoryGroup: r.category.group,
      neighborhood: r.neighborhood?.name ?? null,
    })),
  );
  const byId = new Map(reports.map((r) => [r.id, r]));
  return zones.slice(0, take).map((z) => ({
    ...z,
    refCode: byId.get(z.reportId)?.refCode ?? "",
    categoryName: byId.get(z.reportId)?.category.name ?? "",
  }));
}

export async function getBacklogSeries(municipalityId: string, days = 60) {
  const since = startOfUtcDay(new Date(Date.now() - days * 86_400_000));
  const rows = await prisma.analyticsSummary.findMany({
    where: { municipalityId, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, openReports: true, criticalOpen: true, newReports: true, resolvedReports: true },
  });
  return rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
}

/** Persist daily snapshots (idempotent upserts) for the given UTC days. */
export async function snapshotDays(municipalityId: string, days: Date[]): Promise<number> {
  const reports = await prisma.report.findMany({
    where: { municipalityId },
    select: {
      createdAt: true,
      resolvedAt: true,
      status: true,
      dedupStatus: true,
      severity: true,
      severityScore: true,
      category: { select: { slug: true } },
    },
  });
  const flat = reports.map((r) => ({ ...r, categorySlug: r.category.slug }));
  for (const day of days) {
    const s = summarizeDay(flat, day);
    const data = {
      ...s,
      byCategory: s.byCategory as Prisma.InputJsonValue,
      bySeverity: s.bySeverity as Prisma.InputJsonValue,
    };
    await prisma.analyticsSummary.upsert({
      where: { municipalityId_date: { municipalityId, date: s.date } },
      create: { municipalityId, ...data },
      update: data,
    });
  }
  return days.length;
}
