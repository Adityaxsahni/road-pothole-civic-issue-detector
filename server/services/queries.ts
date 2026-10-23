import "server-only";
import type { Prisma, ReportStatus, Severity } from "@prisma/client";
import type { ReportFilters } from "@/lib/validation";
import { isStaff } from "@/lib/roles";
import type { SessionUser } from "../auth";
import { prisma } from "../db";
import { forbidden, notFound } from "./errors";

export function buildReportWhere(
  filters: Partial<ReportFilters>,
  municipalityId?: string | null,
): Prisma.ReportWhereInput {
  const and: Prisma.ReportWhereInput[] = [];
  if (municipalityId) and.push({ municipalityId });
  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { refCode: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status?.length) and.push({ status: { in: filters.status as ReportStatus[] } });
  if (filters.severity?.length) and.push({ severity: { in: filters.severity as Severity[] } });
  if (filters.category?.length) and.push({ category: { slug: { in: filters.category } } });
  if (filters.neighborhood) and.push({ neighborhoodId: filters.neighborhood });
  if (filters.team) and.push({ assignments: { some: { teamId: filters.team, active: true } } });
  if (filters.dedup) and.push({ dedupStatus: filters.dedup });
  if (filters.from) and.push({ createdAt: { gte: filters.from } });
  if (filters.to) {
    const end = new Date(filters.to);
    end.setUTCHours(23, 59, 59, 999);
    and.push({ createdAt: { lte: end } });
  }
  return and.length ? { AND: and } : {};
}

function orderBy(sort: ReportFilters["sort"] = "priority"): Prisma.ReportOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "severity":
      return [{ severityScore: "desc" }, { createdAt: "desc" }];
    default:
      return [{ priorityScore: "desc" }, { createdAt: "desc" }];
  }
}

export const reportListSelect = {
  id: true,
  refCode: true,
  title: true,
  status: true,
  severity: true,
  severityScore: true,
  priorityScore: true,
  confidence: true,
  aiAccepted: true,
  createdAt: true,
  address: true,
  latitude: true,
  longitude: true,
  dedupStatus: true,
  duplicateCount: true,
  category: { select: { name: true, slug: true, color: true, icon: true } },
  neighborhood: { select: { name: true } },
  assignments: {
    where: { active: true },
    take: 1,
    select: { team: { select: { name: true, color: true } } },
  },
  media: { take: 1, orderBy: { createdAt: "asc" }, select: { thumbnailUrl: true, type: true } },
} satisfies Prisma.ReportSelect;

export type ReportListItem = Prisma.ReportGetPayload<{ select: typeof reportListSelect }>;

export async function listReports(user: SessionUser, filters: ReportFilters) {
  const where = isStaff(user)
    ? buildReportWhere(filters, user.municipalityId)
    : { AND: [buildReportWhere(filters), { userId: user.id }] };
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      select: reportListSelect,
      orderBy: orderBy(filters.sort),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.report.count({ where }),
  ]);
  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export async function getReportDetail(id: string, user: SessionUser) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      category: true,
      aiSuggestedCategory: { select: { name: true, slug: true } },
      neighborhood: { select: { name: true } },
      assignedTo: { select: { id: true, name: true } },
      media: { orderBy: { createdAt: "asc" } },
      detections: { orderBy: { confidence: "desc" } },
      activity: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true, role: true } } },
      },
      assignments: {
        orderBy: { createdAt: "desc" },
        include: {
          team: { select: { id: true, name: true, color: true } },
          assignee: { select: { name: true } },
        },
      },
      duplicateOf: { select: { id: true, refCode: true, title: true, status: true, createdAt: true } },
      duplicates: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          refCode: true,
          title: true,
          status: true,
          dedupStatus: true,
          duplicateScore: true,
          createdAt: true,
        },
      },
      duplicateGroup: { select: { id: true, reason: true } },
      primaryOf: { select: { id: true, reason: true, createdAt: true } },
    },
  });
  if (!report) throw notFound("Report");
  const staff = isStaff(user);
  if (!staff && report.userId !== user.id) throw forbidden();
  if (staff && user.municipalityId && report.municipalityId !== user.municipalityId) throw forbidden();
  if (!staff) {
    // Citizens see the public timeline only.
    report.activity = report.activity.filter((a) => a.isPublic);
  }
  return report;
}

export type ReportDetail = Awaited<ReturnType<typeof getReportDetail>>;

export interface MapPoint {
  id: string;
  refCode: string;
  title: string;
  lat: number;
  lng: number;
  status: ReportStatus;
  severity: Severity;
  priority: number;
  category: string;
  categoryName: string;
  createdAt: string;
  duplicateCount: number;
}

/** Lightweight, privacy-safe points for map rendering (no media, no reporter identity). */
export async function getMapPoints(
  filters: Partial<ReportFilters>,
  municipalityId?: string | null,
  limit = 5000,
): Promise<MapPoint[]> {
  const where = buildReportWhere(filters, municipalityId);
  const rows = await prisma.report.findMany({
    where: { AND: [where, { dedupStatus: { not: "DUPLICATE" } }, { status: { not: "REJECTED" } }] },
    select: {
      id: true,
      refCode: true,
      title: true,
      latitude: true,
      longitude: true,
      status: true,
      severity: true,
      priorityScore: true,
      createdAt: true,
      duplicateCount: true,
      category: { select: { slug: true, name: true } },
    },
    orderBy: { priorityScore: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    refCode: r.refCode,
    title: r.title,
    lat: r.latitude,
    lng: r.longitude,
    status: r.status,
    severity: r.severity,
    priority: r.priorityScore,
    category: r.category.slug,
    categoryName: r.category.name,
    createdAt: r.createdAt.toISOString(),
    duplicateCount: r.duplicateCount,
  }));
}

export async function getExportRows(user: SessionUser, filters: ReportFilters, limit = 10_000) {
  const rows = await prisma.report.findMany({
    where: buildReportWhere(filters, user.municipalityId),
    orderBy: orderBy(filters.sort),
    take: limit,
    select: {
      refCode: true,
      title: true,
      status: true,
      severity: true,
      severityScore: true,
      priorityScore: true,
      confidence: true,
      latitude: true,
      longitude: true,
      address: true,
      roadType: true,
      trafficLevel: true,
      dedupStatus: true,
      duplicateCount: true,
      createdAt: true,
      resolvedAt: true,
      category: { select: { name: true } },
      neighborhood: { select: { name: true } },
      duplicateOf: { select: { refCode: true } },
      assignments: { where: { active: true }, take: 1, select: { team: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    ref: r.refCode,
    title: r.title,
    category: r.category.name,
    status: r.status,
    severity: r.severity,
    severityScore: r.severityScore,
    priorityScore: r.priorityScore,
    aiConfidence: r.confidence,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    neighborhood: r.neighborhood?.name ?? "",
    roadType: r.roadType,
    trafficLevel: r.trafficLevel,
    dedupStatus: r.dedupStatus,
    duplicateOf: r.duplicateOf?.refCode ?? "",
    duplicateCount: r.duplicateCount,
    team: r.assignments[0]?.team.name ?? "",
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
  }));
}

export async function getFilterOptions(municipalityId: string | null) {
  const where = municipalityId ? { municipalityId } : {};
  const [categories, neighborhoods, teams] = await Promise.all([
    prisma.issueCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    prisma.neighborhood.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { categories, neighborhoods, teams };
}
