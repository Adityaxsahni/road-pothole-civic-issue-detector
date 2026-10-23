import type { DedupStatus } from "@prisma/client";
import { haversineMeters, type LatLng } from "./geo";
import { bestHashSimilarity } from "./phash";
import { clamp, round } from "./utils";

export interface DedupSubject extends LatLng {
  createdAt: Date;
  categorySlug: string;
  categoryGroup: string;
  phashes: string[];
}

export interface DedupCandidate extends DedupSubject {
  id: string;
}

export interface DedupOptions {
  radiusM: number;
  windowDays: number;
}

export interface DuplicateMatch {
  candidateId: string;
  score: number;
  distanceM: number;
  hoursApart: number;
  imageSimilarity: number | null;
  categoryMatch: "exact" | "group";
  reasons: string[];
}

export const DUPLICATE_THRESHOLD = 0.8;
export const SUSPECTED_THRESHOLD = 0.6;

// Different camera angles of the same defect rarely share a perceptual hash, so image similarity
// acts as a strong confirmation signal rather than a hard requirement.
const WEIGHTS_WITH_IMAGE = { geo: 0.45, time: 0.15, image: 0.25, category: 0.15 };
const WEIGHTS_NO_IMAGE = { geo: 0.55, time: 0.2, image: 0, category: 0.25 };

/**
 * Score how likely `candidate` describes the same real-world issue as `subject`.
 * Hard gates (distance, time window, unrelated category) return null; otherwise a 0..1 score
 * combines GPS proximity, time proximity, perceptual image similarity and category agreement.
 */
export function scoreDuplicate(
  subject: DedupSubject,
  candidate: DedupCandidate,
  options: DedupOptions,
): DuplicateMatch | null {
  const distanceM = haversineMeters(subject, candidate);
  if (distanceM > options.radiusM) return null;

  const hoursApart = Math.abs(subject.createdAt.getTime() - candidate.createdAt.getTime()) / 3_600_000;
  const windowHours = options.windowDays * 24;
  if (hoursApart > windowHours) return null;

  const categoryMatch =
    subject.categorySlug === candidate.categorySlug
      ? "exact"
      : subject.categoryGroup === candidate.categoryGroup
        ? "group"
        : null;
  if (!categoryMatch) return null;

  const geo = clamp(1 - distanceM / options.radiusM);
  // Time similarity decays slowly at first: same-week reports are almost equally likely duplicates.
  const time = clamp(1 - (hoursApart / windowHours) ** 1.5);
  const category = categoryMatch === "exact" ? 1 : 0.5;
  const imageSimilarity = bestHashSimilarity(subject.phashes, candidate.phashes);

  const w = imageSimilarity == null ? WEIGHTS_NO_IMAGE : WEIGHTS_WITH_IMAGE;
  const score = clamp(w.geo * geo + w.time * time + w.image * (imageSimilarity ?? 0) + w.category * category);

  const reasons = [`${Math.round(distanceM)} m apart`, `${formatHours(hoursApart)} apart`];
  reasons.push(categoryMatch === "exact" ? "same category" : "related category");
  if (imageSimilarity != null) reasons.push(`${Math.round(imageSimilarity * 100)}% image similarity`);

  return {
    candidateId: candidate.id,
    score: round(score, 3),
    distanceM: round(distanceM, 1),
    hoursApart: round(hoursApart, 1),
    imageSimilarity: imageSimilarity == null ? null : round(imageSimilarity, 3),
    categoryMatch,
    reasons,
  };
}

export function classifyDuplicate(score: number): DedupStatus {
  if (score >= DUPLICATE_THRESHOLD) return "DUPLICATE";
  if (score >= SUSPECTED_THRESHOLD) return "SUSPECTED";
  return "UNIQUE";
}

/** Highest-scoring match among candidates, or null if none passes the gates. */
export function findBestDuplicate(
  subject: DedupSubject,
  candidates: DedupCandidate[],
  options: DedupOptions,
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;
  for (const candidate of candidates) {
    const match = scoreDuplicate(subject, candidate, options);
    if (match && (!best || match.score > best.score)) best = match;
  }
  return best;
}

function formatHours(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}
