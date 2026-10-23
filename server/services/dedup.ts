import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  classifyDuplicate,
  findBestDuplicate,
  type DedupCandidate,
  type DedupSubject,
  type DuplicateMatch,
} from "@/lib/dedup";
import { boundingBox } from "@/lib/geo";
import { env } from "../env";
import { notFound, ServiceError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

export interface DedupResult {
  status: "UNIQUE" | "SUSPECTED" | "DUPLICATE";
  /** Primary report this one duplicates (resolved through merged duplicates). */
  primaryId: string | null;
  match: DuplicateMatch | null;
}

/**
 * Find the most likely existing report describing the same issue. Candidates are pre-filtered
 * in SQL with an indexed bounding box and time window, then scored in the application layer.
 */
export async function detectDuplicate(
  db: Db,
  municipalityId: string,
  subject: DedupSubject,
  excludeReportId?: string,
): Promise<DedupResult> {
  const { DEDUP_RADIUS_M, DEDUP_WINDOW_DAYS } = env();
  const box = boundingBox(subject, DEDUP_RADIUS_M);
  const windowMs = DEDUP_WINDOW_DAYS * 86_400_000;
  const rows = await db.report.findMany({
    where: {
      municipalityId,
      id: excludeReportId ? { not: excludeReportId } : undefined,
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
      createdAt: {
        gte: new Date(subject.createdAt.getTime() - windowMs),
        lte: new Date(subject.createdAt.getTime() + windowMs),
      },
      status: { not: "REJECTED" },
      // An issue fixed before this sighting is a recurrence, not a duplicate.
      OR: [{ resolvedAt: null }, { resolvedAt: { gte: subject.createdAt } }],
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      duplicateOfId: true,
      dedupStatus: true,
      category: { select: { slug: true, group: true } },
      media: { select: { phash: true } },
    },
    take: 200,
  });

  const candidates: DedupCandidate[] = rows.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    createdAt: r.createdAt,
    categorySlug: r.category.slug,
    categoryGroup: r.category.group,
    phashes: r.media.map((m) => m.phash).filter((h): h is string => !!h),
  }));
  const match = findBestDuplicate(subject, candidates, {
    radiusM: DEDUP_RADIUS_M,
    windowDays: DEDUP_WINDOW_DAYS,
  });
  if (!match) return { status: "UNIQUE", primaryId: null, match: null };

  const status = classifyDuplicate(match.score);
  if (status === "UNIQUE") return { status, primaryId: null, match };
  const matched = rows.find((r) => r.id === match.candidateId)!;
  // Matching a confirmed duplicate links to its primary so groups never chain.
  const primaryId =
    matched.dedupStatus === "DUPLICATE" && matched.duplicateOfId ? matched.duplicateOfId : matched.id;
  return { status, primaryId, match };
}

function reasonText(match: DuplicateMatch | null, manual: boolean): string {
  if (manual) return "Confirmed by city staff";
  return match ? `Auto-detected: ${match.reasons.join(", ")}` : "Linked duplicate";
}

/** Merge `reportId` into `primaryId`: link, close as DUPLICATE, bump corroboration count. */
export async function mergeIntoPrimary(
  tx: Prisma.TransactionClient,
  args: { reportId: string; primaryId: string; match: DuplicateMatch | null; actorId?: string | null },
): Promise<void> {
  const { reportId, primaryId, match, actorId } = args;
  if (reportId === primaryId) throw new ServiceError("A report cannot duplicate itself");
  const primary = await tx.report.findUnique({
    where: { id: primaryId },
    select: { id: true, refCode: true, dedupStatus: true, duplicateOfId: true },
  });
  if (!primary) throw notFound("Primary report");
  if (primary.dedupStatus === "DUPLICATE")
    throw new ServiceError("Cannot merge into a report that is itself a duplicate");

  const report = await tx.report.findUnique({
    where: { id: reportId },
    select: { status: true, refCode: true },
  });
  if (!report) throw notFound("Report");

  const group = await tx.duplicateGroup.upsert({
    where: { primaryReportId: primaryId },
    create: { primaryReportId: primaryId, reason: reasonText(match, !!actorId) },
    update: {},
  });

  await tx.report.update({
    where: { id: reportId },
    data: {
      dedupStatus: "DUPLICATE",
      duplicateOfId: primaryId,
      duplicateGroupId: group.id,
      duplicateScore: match?.score ?? undefined,
      status: "DUPLICATE",
    },
  });
  await tx.report.update({ where: { id: primaryId }, data: { duplicateCount: { increment: 1 } } });

  await tx.statusLog.createMany({
    data: [
      {
        reportId,
        type: "DUPLICATE",
        status: "DUPLICATE",
        previousStatus: report.status,
        note: `Merged into ${primary.refCode} — ${reasonText(match, !!actorId).replace(/^Auto-detected: /, "")}`,
        actorId: actorId ?? null,
        meta: match ? (match as unknown as Prisma.InputJsonValue) : undefined,
      },
      {
        reportId: primaryId,
        type: "DUPLICATE",
        status: (await tx.report.findUniqueOrThrow({ where: { id: primaryId }, select: { status: true } }))
          .status,
        note: `Duplicate report ${report.refCode} merged — corroboration increased`,
        isPublic: false,
        actorId: actorId ?? null,
      },
    ],
  });
}

/** Undo a merge: restore the report as an independent issue. */
export async function unlinkDuplicate(
  tx: Prisma.TransactionClient,
  reportId: string,
  actorId: string,
): Promise<string | null> {
  const report = await tx.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("Report");
  if (!report.duplicateOfId) throw new ServiceError("Report is not linked to another report");
  const primaryId = report.duplicateOfId;
  const wasMerged = report.dedupStatus === "DUPLICATE";

  await tx.report.update({
    where: { id: reportId },
    data: {
      dedupStatus: "UNIQUE",
      duplicateOfId: null,
      duplicateGroupId: null,
      duplicateScore: null,
      status: wasMerged ? "NEW" : report.status,
    },
  });
  if (wasMerged) {
    await tx.report.update({ where: { id: primaryId }, data: { duplicateCount: { decrement: 1 } } });
    const remaining = await tx.report.count({
      where: { duplicateOfId: primaryId, dedupStatus: "DUPLICATE" },
    });
    if (remaining === 0) await tx.duplicateGroup.deleteMany({ where: { primaryReportId: primaryId } });
  }
  await tx.statusLog.create({
    data: {
      reportId,
      type: "DUPLICATE",
      status: wasMerged ? "NEW" : report.status,
      previousStatus: report.status,
      note: wasMerged
        ? "Unmerged by staff — tracked as a separate issue"
        : "Duplicate suspicion dismissed by staff",
      actorId,
    },
  });
  return primaryId;
}
