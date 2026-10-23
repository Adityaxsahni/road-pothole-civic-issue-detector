import type { RoadType, Severity, TrafficLevel } from "@prisma/client";
import { clamp, round } from "./utils";

/* ───────────────────────────── Severity ───────────────────────────── */

export interface SeverityInput {
  /** Inherent hazard of the category, 0-100. */
  categoryBase: number;
  /** AI confidence for the detection backing this report, 0-1. */
  aiConfidence?: number | null;
  /** Fraction of the image covered by the detected damage, 0-1. */
  damageAreaRatio?: number | null;
  /** Whether the AI label agrees with the final (citizen-confirmed) category. */
  aiAgrees?: boolean;
}

export function severityLevel(score: number): Severity {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

/**
 * Severity blends the category's inherent hazard with the physical damage estimate from the
 * detector. A pothole covering ~36% of the frame saturates the damage term. When the detector
 * disagrees with the citizen's category we fall back to a neutral damage estimate, since its
 * bounding box describes something else.
 */
export function computeSeverity(input: SeverityInput): { score: number; level: Severity } {
  const base = clamp(input.categoryBase, 0, 100);
  const hasDetection =
    input.aiConfidence != null && input.damageAreaRatio != null && input.aiAgrees !== false;
  if (!hasDetection) {
    return { score: round(base), level: severityLevel(base) };
  }
  const damage = clamp(Math.sqrt(clamp(input.damageAreaRatio!)) / 0.6);
  const confidence = clamp(input.aiConfidence!);
  // Damage scales up or down from the base; confidence controls how much we trust that adjustment.
  const adjustment = (damage - 0.4) * 60 * (0.4 + 0.6 * confidence);
  const score = clamp(base + adjustment, 0, 100);
  return { score: round(score), level: severityLevel(score) };
}

/* ───────────────────────────── Priority ───────────────────────────── */

export interface PriorityInput {
  severityScore: number;
  roadType: RoadType;
  trafficLevel: TrafficLevel;
  confidence: number | null;
  /** Reports within ~250 m over the last 180 days (excluding this one and its duplicates). */
  nearbyReportCount: number;
  /** Share of nearby historical reports that were HIGH/CRITICAL, 0-1. */
  nearbyHighSeverityRatio: number;
  /** Whether the report sits inside a current hotspot cluster. */
  inHotspot: boolean;
  /** Number of citizen reports merged into this one. */
  duplicateCount: number;
  /** Hours since the report was filed. */
  ageHours: number;
  /** SLA target for the category. */
  slaHours: number;
}

export type PriorityFactorKey =
  | "severity"
  | "traffic"
  | "roadType"
  | "confidence"
  | "geoRisk"
  | "density"
  | "corroboration"
  | "slaPressure";

export interface PriorityFactor {
  key: PriorityFactorKey;
  label: string;
  /** Normalised factor value, 0-1. */
  value: number;
  weight: number;
  /** Points contributed to the 0-100 score. */
  contribution: number;
  detail: string;
}

export interface PriorityResult {
  score: number;
  factors: PriorityFactor[];
}

export const PRIORITY_WEIGHTS: Record<PriorityFactorKey, number> = {
  severity: 0.34,
  traffic: 0.14,
  roadType: 0.12,
  confidence: 0.05,
  geoRisk: 0.1,
  density: 0.1,
  corroboration: 0.08,
  slaPressure: 0.07,
};

const ROAD_WEIGHT: Record<RoadType, number> = {
  HIGHWAY: 1,
  ARTERIAL: 0.8,
  COLLECTOR: 0.6,
  LOCAL: 0.35,
  UNKNOWN: 0.5,
};
const TRAFFIC_WEIGHT: Record<TrafficLevel, number> = { HEAVY: 1, MODERATE: 0.6, LOW: 0.25, UNKNOWN: 0.5 };

const logSaturate = (n: number, saturation: number) =>
  clamp(Math.log1p(Math.max(0, n)) / Math.log1p(saturation));

/** Explainable 0-100 maintenance priority. Every factor is surfaced to staff in the dashboard. */
export function computePriority(input: PriorityInput): PriorityResult {
  const raw: Array<Omit<PriorityFactor, "weight" | "contribution">> = [
    {
      key: "severity",
      label: "Damage severity",
      value: clamp(input.severityScore / 100),
      detail: `Severity score ${round(input.severityScore)}/100`,
    },
    {
      key: "traffic",
      label: "Traffic impact",
      value: TRAFFIC_WEIGHT[input.trafficLevel],
      detail: `Traffic: ${input.trafficLevel.toLowerCase()}`,
    },
    {
      key: "roadType",
      label: "Road class",
      value: ROAD_WEIGHT[input.roadType],
      detail: `Road type: ${input.roadType.toLowerCase()}`,
    },
    {
      key: "confidence",
      label: "Detection confidence",
      value: clamp(input.confidence ?? 0.5),
      detail:
        input.confidence == null ? "No AI detection" : `AI confidence ${Math.round(input.confidence * 100)}%`,
    },
    {
      key: "geoRisk",
      label: "Geographic risk",
      value: clamp(0.7 * clamp(input.nearbyHighSeverityRatio) + (input.inHotspot ? 0.3 : 0)),
      detail: `${Math.round(clamp(input.nearbyHighSeverityRatio) * 100)}% of nearby issues high-severity${
        input.inHotspot ? ", inside an active hotspot" : ""
      }`,
    },
    {
      key: "density",
      label: "Historical density",
      value: logSaturate(input.nearbyReportCount, 20),
      detail: `${input.nearbyReportCount} reports within 250 m (180 days)`,
    },
    {
      key: "corroboration",
      label: "Citizen corroboration",
      value: logSaturate(input.duplicateCount, 5),
      detail: `${input.duplicateCount} duplicate report${input.duplicateCount === 1 ? "" : "s"} merged`,
    },
    {
      key: "slaPressure",
      label: "SLA pressure",
      value: clamp(input.ageHours / Math.max(1, input.slaHours)),
      detail: `Open ${Math.round(input.ageHours)} h of ${input.slaHours} h target`,
    },
  ];

  const factors = raw.map((f) => {
    const weight = PRIORITY_WEIGHTS[f.key];
    return { ...f, value: round(f.value, 3), weight, contribution: round(f.value * weight * 100, 2) };
  });
  const score = round(
    clamp(
      factors.reduce((sum, f) => sum + f.contribution, 0),
      0,
      100,
    ),
  );
  return { score, factors };
}
