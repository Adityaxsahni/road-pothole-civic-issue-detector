import { haversineMeters } from "./geo";
import { round } from "./utils";

export interface SnapshotReport {
  createdAt: Date;
  resolvedAt: Date | null;
  status: string;
  dedupStatus: string;
  severity: string;
  severityScore: number;
  categorySlug: string;
}

export interface DailySummary {
  date: Date;
  totalReports: number;
  newReports: number;
  resolvedReports: number;
  openReports: number;
  duplicateReports: number;
  criticalOpen: number;
  avgSeverity: number;
  avgResolutionHours: number | null;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Point-in-time metrics for one UTC day, reconstructed from report timestamps. */
export function summarizeDay(reports: SnapshotReport[], day: Date): DailySummary {
  const start = startOfUtcDay(day).getTime();
  const end = start + 86_400_000;
  let total = 0;
  let created = 0;
  let resolved = 0;
  let open = 0;
  let duplicates = 0;
  let criticalOpen = 0;
  let severitySum = 0;
  let resolutionSum = 0;
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const r of reports) {
    const c = r.createdAt.getTime();
    if (c >= end) continue;
    total++;
    const isDuplicate = r.dedupStatus === "DUPLICATE";
    if (c >= start) {
      created++;
      severitySum += r.severityScore;
      if (isDuplicate) duplicates++;
      byCategory[r.categorySlug] = (byCategory[r.categorySlug] ?? 0) + 1;
    }
    const resolvedAt = r.resolvedAt?.getTime();
    if (resolvedAt != null && resolvedAt >= start && resolvedAt < end && !isDuplicate) {
      resolved++;
      resolutionSum += (resolvedAt - c) / 3_600_000;
    }
    const stillOpen = !isDuplicate && r.status !== "REJECTED" && (resolvedAt == null || resolvedAt >= end);
    if (stillOpen) {
      open++;
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      if (r.severity === "CRITICAL") criticalOpen++;
    }
  }
  return {
    date: new Date(start),
    totalReports: total,
    newReports: created,
    resolvedReports: resolved,
    openReports: open,
    duplicateReports: duplicates,
    criticalOpen,
    avgSeverity: created ? round(severitySum / created) : 0,
    avgResolutionHours: resolved ? round(resolutionSum / resolved) : null,
    byCategory,
    bySeverity,
  };
}

export interface RepeatInput {
  id: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  resolvedAt: Date | null;
  categoryGroup: string;
  neighborhood: string | null;
}

export interface RepeatZone {
  reportId: string;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
  categoryGroup: string;
  recurrences: number;
}

/**
 * A repeat problem zone is a fixed issue that came back: a later report in the same category
 * group within `radiusM` of a resolved report, filed after it was resolved.
 */
export function findRepeatZones(reports: RepeatInput[], radiusM = 75, collapseM = 250): RepeatZone[] {
  const zones: RepeatZone[] = [];
  for (const r of reports) {
    if (!r.resolvedAt) continue;
    const recurrences = reports.filter(
      (o) =>
        o.id !== r.id &&
        o.categoryGroup === r.categoryGroup &&
        o.createdAt > r.resolvedAt! &&
        haversineMeters(r, o) <= radiusM,
    ).length;
    if (recurrences > 0) {
      zones.push({
        reportId: r.id,
        latitude: r.latitude,
        longitude: r.longitude,
        neighborhood: r.neighborhood,
        categoryGroup: r.categoryGroup,
        recurrences,
      });
    }
  }
  // Collapse nearby zones of the same kind, keeping the strongest one per area.
  zones.sort((a, b) => b.recurrences - a.recurrences);
  const kept: RepeatZone[] = [];
  for (const z of zones) {
    if (!kept.some((k) => k.categoryGroup === z.categoryGroup && haversineMeters(k, z) <= collapseM))
      kept.push(z);
  }
  return kept;
}
