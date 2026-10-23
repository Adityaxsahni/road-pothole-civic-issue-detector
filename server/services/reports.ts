import "server-only";
import { randomUUID } from "node:crypto";
import type { IssueCategory, Prisma, ReportStatus } from "@prisma/client";
import { STATUS_META, STATUS_TRANSITIONS } from "@/lib/constants";
import { nearestNeighborhood } from "@/lib/geo";
import { generateRefCode } from "@/lib/ref-code";
import { computePriority, computeSeverity } from "@/lib/scoring";
import type { CreateReportInput } from "@/lib/validation";
import { analyzeImage, type DetectionOutput } from "../ai";
import type { SessionUser } from "../auth";
import { prisma } from "../db";
import { env } from "../env";
import { isImageType, sniffFileType, type SniffedType } from "../media/file-type";
import { processImage } from "../media/process";
import { storage } from "../storage";
import { detectDuplicate, mergeIntoPrimary, unlinkDuplicate, type DedupResult } from "./dedup";
import { forbidden, notFound, ServiceError } from "./errors";
import { scheduleHotspotRecompute } from "./hotspots";
import { dispatch, notifyCitizen, raiseUrgentAlert } from "./notifications";
import { loadPriorityContext, recomputeReportPriority } from "./priority";

/* ───────────────────────────── Uploads ───────────────────────────── */

export interface UploadedFile {
  name: string;
  size: number;
  data: Buffer;
}

interface ValidatedFile extends UploadedFile {
  type: SniffedType;
}

const EXT: Record<SniffedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function validateUpload(file: UploadedFile): ValidatedFile {
  const { MAX_IMAGE_MB, MAX_VIDEO_MB } = env();
  const type = sniffFileType(file.data);
  if (!type) throw new ServiceError(`"${file.name}" is not a supported image or video`, 415);
  const limit = (isImageType(type) ? MAX_IMAGE_MB : MAX_VIDEO_MB) * 1024 * 1024;
  if (file.size > limit) {
    throw new ServiceError(
      `"${file.name}" exceeds the ${isImageType(type) ? MAX_IMAGE_MB : MAX_VIDEO_MB} MB limit`,
      413,
    );
  }
  return { ...file, type };
}

function storageKey(ext: string) {
  const now = new Date();
  return `reports/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

interface StoredMedia {
  type: "IMAGE" | "VIDEO";
  url: string;
  storageKey: string;
  thumbnailUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  storageProvider: string;
  phash: string | null;
  derived: boolean;
  analysisInput: Buffer | null;
}

async function storeMedia(file: ValidatedFile, derived = false): Promise<StoredMedia> {
  const store = storage();
  if (isImageType(file.type)) {
    const img = await processImage(file.data).catch(() => {
      throw new ServiceError(`"${file.name}" could not be decoded as an image`, 422);
    });
    const key = storageKey("jpg");
    const saved = await store.put(key, img.data, "image/jpeg");
    const thumb = await store.put(key.replace(/\.jpg$/, "_thumb.webp"), img.thumbnail, "image/webp");
    return {
      type: "IMAGE",
      url: saved.url,
      storageKey: key,
      thumbnailUrl: thumb.url,
      mimeType: "image/jpeg",
      sizeBytes: img.data.length,
      width: img.width,
      height: img.height,
      storageProvider: saved.provider,
      phash: img.phash,
      derived,
      analysisInput: img.data,
    };
  }
  const key = storageKey(EXT[file.type]);
  const saved = await store.put(key, file.data, file.type);
  return {
    type: "VIDEO",
    url: saved.url,
    storageKey: key,
    thumbnailUrl: null,
    mimeType: file.type,
    sizeBytes: file.size,
    width: null,
    height: null,
    storageProvider: saved.provider,
    phash: null,
    derived,
    analysisInput: null,
  };
}

async function cleanupMedia(media: StoredMedia[]) {
  const store = storage();
  await Promise.allSettled(
    media.flatMap((m) => [
      store.delete(m.storageKey),
      m.thumbnailUrl ? store.delete(m.storageKey.replace(/\.jpg$/, "_thumb.webp")) : null,
    ]),
  );
}

/* ───────────────────────────── Detection ───────────────────────────── */

export interface DetectionSuggestion {
  label: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  severityScore: number;
  severity: string;
  boundingBox: DetectionOutput["boundingBox"];
  damageAreaRatio: number | null;
  modelName: string;
  modelVersion: string;
  source: DetectionOutput["source"];
  latencyMs: number;
  alternatives: Array<{ label: string; confidence: number }>;
}

function toSuggestion(out: DetectionOutput, categories: IssueCategory[]): DetectionSuggestion {
  const category = categories.find((c) => c.slug === out.label && c.active) ?? null;
  const base = category?.baseSeverity ?? 30;
  const severity = computeSeverity({
    categoryBase: base,
    aiConfidence: out.confidence,
    damageAreaRatio: out.damageAreaRatio,
    aiAgrees: true,
  });
  return {
    label: out.label,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    confidence: out.confidence,
    severityScore: severity.score,
    severity: severity.level,
    boundingBox: out.boundingBox,
    damageAreaRatio: out.damageAreaRatio,
    modelName: out.modelName,
    modelVersion: out.modelVersion,
    source: out.source,
    latencyMs: out.latencyMs,
    alternatives: out.detections
      .filter((d) => d.label !== out.label)
      .map((d) => ({ label: d.label, confidence: d.confidence })),
  };
}

/** Analyse an image before submission so the wizard can pre-fill the category (nothing is stored). */
export async function previewDetection(file: UploadedFile): Promise<DetectionSuggestion> {
  const valid = validateUpload(file);
  if (!isImageType(valid.type)) throw new ServiceError("AI preview requires a photo or a video frame", 415);
  const [out, categories] = await Promise.all([analyzeImage(valid.data), prisma.issueCategory.findMany()]);
  return toSuggestion(out, categories);
}

/* ───────────────────────────── Create ───────────────────────────── */

export interface CreateReportResult {
  id: string;
  refCode: string;
  status: ReportStatus;
  severity: string;
  priorityScore: number;
  detection: DetectionSuggestion | null;
  dedup: {
    status: DedupResult["status"];
    primaryId: string | null;
    primaryRefCode: string | null;
    score: number | null;
  };
}

/**
 * Report submission pipeline:
 * validate → normalise & store media → AI analysis → severity → dedup → priority → persist
 * (single transaction) → urgent alerts + hotspot refresh in the background.
 */
export async function createReport(args: {
  user: SessionUser;
  input: CreateReportInput;
  files: UploadedFile[];
  poster?: UploadedFile | null;
}): Promise<CreateReportResult> {
  const { user, input } = args;
  if (args.files.length === 0)
    throw new ServiceError("Add at least one photo or video", 400, { media: ["Required"] });
  if (args.files.length > 4)
    throw new ServiceError("You can attach up to 4 files", 400, { media: ["Too many files"] });

  const validated = args.files.map(validateUpload);
  const poster = args.poster ? validateUpload(args.poster) : null;
  if (poster && !isImageType(poster.type)) throw new ServiceError("Video poster must be an image", 415);

  const [category, categories, municipality] = await Promise.all([
    prisma.issueCategory.findFirst({ where: { slug: input.categorySlug, active: true } }),
    prisma.issueCategory.findMany(),
    user.municipalityId
      ? prisma.municipality.findUnique({ where: { id: user.municipalityId } })
      : prisma.municipality.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);
  if (!category)
    throw new ServiceError("Unknown issue category", 400, { categorySlug: ["Choose a valid category"] });
  if (!municipality) throw new ServiceError("No municipality is configured", 500);

  const stored: StoredMedia[] = [];
  try {
    for (const file of validated) stored.push(await storeMedia(file));
    if (poster && !stored.some((m) => m.type === "IMAGE")) stored.push(await storeMedia(poster, true));

    // AI analysis on every image; the most confident non-"other" result represents the report.
    const analyses: Array<{ index: number; out: DetectionOutput }> = [];
    for (const [index, m] of stored.entries()) {
      if (m.analysisInput) analyses.push({ index, out: await analyzeImage(m.analysisInput) });
    }
    const primary =
      [...analyses].sort(
        (a, b) =>
          Number(b.out.label !== "other") - Number(a.out.label !== "other") ||
          b.out.confidence - a.out.confidence,
      )[0] ?? null;
    const suggestion = primary ? toSuggestion(primary.out, categories) : null;
    const aiCategory = suggestion?.categoryId
      ? categories.find((c) => c.id === suggestion.categoryId)!
      : null;
    const aiAccepted = aiCategory && aiCategory.slug !== "other" ? aiCategory.id === category.id : null;
    const aiAgrees = aiCategory ? aiCategory.group === category.group : false;

    const severity = computeSeverity({
      categoryBase: category.baseSeverity,
      aiConfidence: primary?.out.confidence,
      damageAreaRatio: primary?.out.damageAreaRatio,
      aiAgrees,
    });

    const now = new Date();
    const point = { latitude: input.latitude, longitude: input.longitude };
    const [neighborhoods, dedup, context] = await Promise.all([
      prisma.neighborhood.findMany({ where: { municipalityId: municipality.id } }),
      detectDuplicate(prisma, municipality.id, {
        ...point,
        createdAt: now,
        categorySlug: category.slug,
        categoryGroup: category.group,
        phashes: stored.map((m) => m.phash).filter((h): h is string => !!h),
      }),
      loadPriorityContext(prisma, municipality.id, point, now),
    ]);
    const neighborhood = nearestNeighborhood(point, neighborhoods);
    const confidence = primary && aiAgrees ? primary.out.confidence : null;
    const priority = computePriority({
      severityScore: severity.score,
      roadType: input.roadType,
      trafficLevel: input.trafficLevel,
      confidence,
      duplicateCount: 0,
      ageHours: 0,
      slaHours: category.slaHours,
      ...context,
    });

    const report = await prisma.$transaction(async (tx) => {
      let refCode = generateRefCode();
      while (await tx.report.findUnique({ where: { refCode }, select: { id: true } }))
        refCode = generateRefCode();

      const created = await tx.report.create({
        data: {
          refCode,
          userId: user.id,
          municipalityId: municipality.id,
          neighborhoodId: neighborhood?.id ?? null,
          title: input.title,
          description: input.description,
          notes: input.notes ?? null,
          categoryId: category.id,
          aiSuggestedCategoryId: aiCategory?.id ?? null,
          aiAccepted,
          severity: severity.level,
          severityScore: severity.score,
          priorityScore: priority.score,
          priorityBreakdown: priority.factors as unknown as Prisma.InputJsonValue,
          confidence,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyM: input.accuracyM ?? null,
          address: input.address ?? null,
          roadType: input.roadType,
          trafficLevel: input.trafficLevel,
          createdAt: now,
        },
      });

      const mediaRows = [];
      for (const m of stored) {
        mediaRows.push(
          await tx.mediaAsset.create({
            data: {
              reportId: created.id,
              type: m.type,
              url: m.url,
              storageKey: m.storageKey,
              thumbnailUrl: m.thumbnailUrl,
              mimeType: m.mimeType,
              sizeBytes: m.sizeBytes,
              width: m.width,
              height: m.height,
              storageProvider: m.storageProvider,
              phash: m.phash,
              derived: m.derived,
            },
          }),
        );
      }

      for (const a of analyses) {
        const s = toSuggestion(a.out, categories);
        await tx.detectionResult.create({
          data: {
            reportId: created.id,
            mediaAssetId: mediaRows[a.index].id,
            modelName: a.out.modelName,
            modelVersion: a.out.modelVersion,
            label: a.out.label,
            confidence: a.out.confidence,
            boundingBox: (a.out.boundingBox ?? undefined) as Prisma.InputJsonValue | undefined,
            severityScore: s.severityScore,
            damageAreaRatio: a.out.damageAreaRatio,
            latencyMs: a.out.latencyMs,
            raw: {
              source: a.out.source,
              detections: a.out.detections,
              ...(a.out.raw ?? {}),
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await tx.statusLog.create({
        data: {
          reportId: created.id,
          type: "CREATED",
          status: "NEW",
          note: "Report submitted",
          actorId: user.id,
        },
      });
      if (suggestion) {
        await tx.statusLog.create({
          data: {
            reportId: created.id,
            type: "AI_ANALYSIS",
            status: "NEW",
            isPublic: false,
            note:
              `${suggestion.modelName} suggested “${suggestion.categoryName ?? suggestion.label}” (${Math.round(suggestion.confidence * 100)}%)` +
              (aiAccepted === false
                ? ` — citizen chose “${category.name}”`
                : aiAccepted
                  ? " — confirmed by citizen"
                  : ""),
          },
        });
      }

      if (dedup.status === "DUPLICATE" && dedup.primaryId) {
        await mergeIntoPrimary(tx, { reportId: created.id, primaryId: dedup.primaryId, match: dedup.match });
      } else if (dedup.status === "SUSPECTED" && dedup.primaryId) {
        await tx.report.update({
          where: { id: created.id },
          data: {
            dedupStatus: "SUSPECTED",
            duplicateOfId: dedup.primaryId,
            duplicateScore: dedup.match?.score,
          },
        });
        await tx.statusLog.create({
          data: {
            reportId: created.id,
            type: "DUPLICATE",
            status: "NEW",
            isPublic: false,
            note: `Flagged as a possible duplicate (${Math.round((dedup.match?.score ?? 0) * 100)}% match: ${dedup.match?.reasons.join(", ")})`,
            meta: dedup.match as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return tx.report.findUniqueOrThrow({ where: { id: created.id } });
    });

    const primaryRef = dedup.primaryId
      ? await prisma.report.findUnique({ where: { id: dedup.primaryId }, select: { refCode: true } })
      : null;

    // Background work: corroboration-driven priority bump, alerts, hotspot refresh.
    const alertThreshold = env().URGENT_PRIORITY_THRESHOLD;
    dispatch(
      (async () => {
        if (report.status === "DUPLICATE" && dedup.primaryId) {
          const updated = await recomputeReportPriority(dedup.primaryId);
          if (updated && updated.previous < alertThreshold && updated.result.score >= alertThreshold) {
            await alertFor(dedup.primaryId);
          }
        } else if (report.priorityScore >= alertThreshold || report.severity === "CRITICAL") {
          await alertFor(report.id);
        }
        scheduleHotspotRecompute(municipality.id);
      })(),
      `post-create ${report.refCode}`,
    );

    return {
      id: report.id,
      refCode: report.refCode,
      status: report.status,
      severity: report.severity,
      priorityScore: report.priorityScore,
      detection: suggestion,
      dedup: {
        status: dedup.status,
        primaryId: dedup.primaryId,
        primaryRefCode: primaryRef?.refCode ?? null,
        score: dedup.match?.score ?? null,
      },
    };
  } catch (err) {
    await cleanupMedia(stored);
    throw err;
  }
}

async function alertFor(reportId: string) {
  const r = await prisma.report.findUnique({ where: { id: reportId }, include: { category: true } });
  if (!r) return;
  await prisma.statusLog.create({
    data: {
      reportId,
      type: "NOTIFICATION",
      status: r.status,
      isPublic: false,
      note: `Urgent alert raised (priority ${Math.round(r.priorityScore)})`,
    },
  });
  await raiseUrgentAlert({
    reportId: r.id,
    refCode: r.refCode,
    municipalityId: r.municipalityId,
    title: r.title,
    categoryName: r.category.name,
    severity: r.severity,
    priorityScore: r.priorityScore,
    address: r.address,
    latitude: r.latitude,
    longitude: r.longitude,
  });
}

/* ───────────────────────────── Triage ───────────────────────────── */

async function loadForStaff(reportId: string, user: SessionUser) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("Report");
  if (user.municipalityId && report.municipalityId !== user.municipalityId) throw forbidden();
  return report;
}

export async function changeStatus(args: {
  user: SessionUser;
  reportId: string;
  status: ReportStatus;
  note?: string;
  isPublic?: boolean;
}) {
  const { user, reportId, status } = args;
  const report = await loadForStaff(reportId, user);
  if (report.status === status)
    throw new ServiceError(`Report is already ${STATUS_META[status].label.toLowerCase()}`);
  if (!STATUS_TRANSITIONS[report.status].includes(status)) {
    throw new ServiceError(
      `Cannot move from ${STATUS_META[report.status].label} to ${STATUS_META[status].label}`,
    );
  }
  if (status === "DUPLICATE") throw new ServiceError("Use the duplicate tools to merge reports");
  if (report.status === "DUPLICATE")
    throw new ServiceError("Use “Unmerge” in the duplicates panel to reopen this report");

  const resolving = status === "RESOLVED";
  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: reportId },
      data: {
        status,
        resolvedAt: resolving ? new Date() : report.status === "RESOLVED" ? null : undefined,
      },
    });
    await tx.statusLog.create({
      data: {
        reportId,
        type: "STATUS_CHANGE",
        status,
        previousStatus: report.status,
        note: args.note || STATUS_META[status].description,
        isPublic: args.isPublic ?? true,
        actorId: user.id,
      },
    });
    if (resolving) {
      await tx.teamAssignment.updateMany({
        where: { reportId, active: true },
        data: { active: false, completedAt: new Date() },
      });
      // Resolving the primary closes the loop for every citizen whose report was merged into it.
      const merged = await tx.report.findMany({
        where: { duplicateOfId: reportId, dedupStatus: "DUPLICATE" },
        select: { id: true },
      });
      if (merged.length) {
        await tx.report.updateMany({
          where: { id: { in: merged.map((m) => m.id) } },
          data: { resolvedAt: new Date() },
        });
        await tx.statusLog.createMany({
          data: merged.map((m) => ({
            reportId: m.id,
            type: "STATUS_CHANGE" as const,
            status: "DUPLICATE" as const,
            note: `The original report ${report.refCode} has been resolved`,
            actorId: user.id,
          })),
        });
      }
    }
  });

  const recipients = resolving
    ? await prisma.report.findMany({
        where: { OR: [{ id: reportId }, { duplicateOfId: reportId, dedupStatus: "DUPLICATE" }] },
        select: { id: true, userId: true },
      })
    : [{ id: reportId, userId: report.userId }];
  if (args.isPublic ?? true) {
    dispatch(
      Promise.all(
        recipients.map((r) =>
          notifyCitizen({
            userId: r.userId,
            reportId: r.id,
            title: `Update on ${report.refCode}`,
            body: resolving
              ? `“${report.title}” has been resolved. Thank you for reporting!`
              : `Status changed to ${STATUS_META[status].label}.`,
          }),
        ),
      ),
      "citizen status notification",
    );
  }
  dispatch(recomputeReportPriority(reportId), "priority recompute");
}

export async function addNote(args: {
  user: SessionUser;
  reportId: string;
  note: string;
  isPublic: boolean;
}) {
  const report = await loadForStaff(args.reportId, args.user);
  return prisma.statusLog.create({
    data: {
      reportId: report.id,
      type: "NOTE",
      status: report.status,
      note: args.note,
      isPublic: args.isPublic,
      actorId: args.user.id,
    },
    include: { actor: { select: { name: true, role: true } } },
  });
}

export async function assignTeam(args: {
  user: SessionUser;
  reportId: string;
  teamId: string;
  assigneeId?: string | null;
  dueAt?: Date | null;
  note?: string;
}) {
  const report = await loadForStaff(args.reportId, args.user);
  if (["RESOLVED", "REJECTED", "DUPLICATE"].includes(report.status))
    throw new ServiceError("Reopen the report before assigning it");
  const team = await prisma.team.findUnique({
    where: { id: args.teamId },
    include: { members: { select: { id: true } } },
  });
  if (!team || team.municipalityId !== report.municipalityId) throw notFound("Team");
  if (args.assigneeId && !team.members.some((m) => m.id === args.assigneeId))
    throw new ServiceError("Assignee is not a member of that team");

  await prisma.$transaction(async (tx) => {
    await tx.teamAssignment.updateMany({
      where: { reportId: report.id, active: true },
      data: { active: false },
    });
    await tx.teamAssignment.create({
      data: {
        reportId: report.id,
        teamId: team.id,
        assigneeId: args.assigneeId ?? null,
        assignedById: args.user.id,
        dueAt: args.dueAt ?? null,
        note: args.note ?? null,
      },
    });
    const nextStatus: ReportStatus = report.status === "IN_PROGRESS" ? "IN_PROGRESS" : "ASSIGNED";
    await tx.report.update({
      where: { id: report.id },
      data: { assignedToId: args.assigneeId ?? null, status: nextStatus },
    });
    await tx.statusLog.create({
      data: {
        reportId: report.id,
        type: "ASSIGNMENT",
        status: nextStatus,
        previousStatus: report.status,
        note: `Assigned to ${team.name}${args.dueAt ? ` · due ${args.dueAt.toISOString().slice(0, 10)}` : ""}${args.note ? ` — ${args.note}` : ""}`,
        actorId: args.user.id,
      },
    });
  });
  if (report.status !== "ASSIGNED" && report.status !== "IN_PROGRESS") {
    dispatch(
      notifyCitizen({
        userId: report.userId,
        reportId: report.id,
        title: `Update on ${report.refCode}`,
        body: `A maintenance crew (${team.name}) has been assigned.`,
      }),
      "citizen assignment notification",
    );
  }
}

export async function decideDuplicate(
  args: { user: SessionUser } & (
    | { decision: "confirm"; reportId: string; primaryId: string }
    | { decision: "dismiss" | "unlink"; reportId: string }
  ),
) {
  const report = await loadForStaff(args.reportId, args.user);
  let affectedPrimary: string | null = null;
  await prisma.$transaction(async (tx) => {
    if (args.decision === "confirm") {
      await loadForStaff(args.primaryId, args.user);
      if (report.dedupStatus === "DUPLICATE") throw new ServiceError("Report is already merged");
      await mergeIntoPrimary(tx, {
        reportId: report.id,
        primaryId: args.primaryId,
        match: null,
        actorId: args.user.id,
      });
      affectedPrimary = args.primaryId;
    } else {
      if (args.decision === "dismiss" && report.dedupStatus !== "SUSPECTED")
        throw new ServiceError("Report is not flagged as a possible duplicate");
      if (args.decision === "unlink" && report.dedupStatus !== "DUPLICATE")
        throw new ServiceError("Report is not merged");
      affectedPrimary = await unlinkDuplicate(tx, report.id, args.user.id);
    }
  });
  await Promise.all([
    recomputeReportPriority(report.id),
    affectedPrimary ? recomputeReportPriority(affectedPrimary) : null,
  ]);
  scheduleHotspotRecompute(report.municipalityId);
}
