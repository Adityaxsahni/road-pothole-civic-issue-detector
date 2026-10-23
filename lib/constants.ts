import type { DedupStatus, ReportStatus, RoadType, Severity, TrafficLevel } from "@prisma/client";

export const APP_NAME = "CivicPulse";
export const APP_TAGLINE = "Report it. Map it. Fix it.";

/** Severity uses the reserved status palette and is always paired with a text label. */
export const SEVERITY_META: Record<Severity, { label: string; color: string; badge: string; rank: number }> =
  {
    LOW: {
      label: "Low",
      color: "#0ca30c",
      badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/25",
      rank: 1,
    },
    MEDIUM: {
      label: "Medium",
      color: "#fab219",
      badge: "bg-amber-50 text-amber-800 ring-amber-600/30",
      rank: 2,
    },
    HIGH: {
      label: "High",
      color: "#ec835a",
      badge: "bg-orange-50 text-orange-800 ring-orange-600/30",
      rank: 3,
    },
    CRITICAL: {
      label: "Critical",
      color: "#d03b3b",
      badge: "bg-red-50 text-red-800 ring-red-600/30",
      rank: 4,
    },
  };

export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const STATUS_META: Record<
  ReportStatus,
  { label: string; badge: string; description: string; open: boolean }
> = {
  NEW: {
    label: "New",
    badge: "bg-sky-50 text-sky-800 ring-sky-600/25",
    description: "Received and awaiting triage",
    open: true,
  },
  VERIFIED: {
    label: "Verified",
    badge: "bg-indigo-50 text-indigo-800 ring-indigo-600/25",
    description: "Confirmed by city staff",
    open: true,
  },
  ASSIGNED: {
    label: "Assigned",
    badge: "bg-violet-50 text-violet-800 ring-violet-600/25",
    description: "A maintenance team has been assigned",
    open: true,
  },
  IN_PROGRESS: {
    label: "In progress",
    badge: "bg-amber-50 text-amber-800 ring-amber-600/30",
    description: "Crew is working on it",
    open: true,
  },
  RESOLVED: {
    label: "Resolved",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/25",
    description: "Fixed and closed",
    open: false,
  },
  REJECTED: {
    label: "Rejected",
    badge: "bg-slate-100 text-slate-700 ring-slate-500/25",
    description: "Not actionable",
    open: false,
  },
  DUPLICATE: {
    label: "Duplicate",
    badge: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-600/25",
    description: "Merged into an existing report",
    open: false,
  },
};

export const STATUSES = Object.keys(STATUS_META) as ReportStatus[];
export const OPEN_STATUSES: ReportStatus[] = STATUSES.filter((s) => STATUS_META[s].open);
export const CLOSED_STATUSES: ReportStatus[] = STATUSES.filter((s) => !STATUS_META[s].open);

/** Allowed manual transitions from the staff dashboard. */
export const STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  NEW: ["VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
  VERIFIED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS", "RESOLVED", "VERIFIED", "REJECTED"],
  IN_PROGRESS: ["RESOLVED", "ASSIGNED"],
  RESOLVED: ["IN_PROGRESS"],
  REJECTED: ["NEW"],
  // Merged duplicates are reopened through the dedicated "unmerge" action.
  DUPLICATE: [],
};

export const DEDUP_META: Record<DedupStatus, { label: string; badge: string }> = {
  UNIQUE: { label: "Unique", badge: "bg-slate-50 text-slate-700 ring-slate-500/20" },
  SUSPECTED: { label: "Possible duplicate", badge: "bg-amber-50 text-amber-800 ring-amber-600/30" },
  DUPLICATE: { label: "Merged duplicate", badge: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-600/25" },
};

export const ROAD_TYPE_META: Record<RoadType, { label: string; hint: string }> = {
  HIGHWAY: { label: "Highway / expressway", hint: "High-speed, multi-lane" },
  ARTERIAL: { label: "Main road", hint: "Major city road with buses" },
  COLLECTOR: { label: "Connector street", hint: "Links neighbourhoods" },
  LOCAL: { label: "Residential lane", hint: "Quiet local street" },
  UNKNOWN: { label: "Not sure", hint: "" },
};

export const TRAFFIC_META: Record<TrafficLevel, { label: string }> = {
  HEAVY: { label: "Heavy" },
  MODERATE: { label: "Moderate" },
  LOW: { label: "Light" },
  UNKNOWN: { label: "Not sure" },
};

/** Categorical palette in fixed order (validated adjacent-pair CVD safe). */
export const CATEGORICAL = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];
export const NEUTRAL_SERIES = "#898781";

/** Sequential blue ramp (light → dark) for magnitude such as heatmaps. */
export const SEQUENTIAL_BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export const PRIORITY_BANDS = [
  { min: 75, label: "P1 · Urgent", short: "P1", badge: "bg-red-600 text-white ring-red-700/30" },
  { min: 55, label: "P2 · High", short: "P2", badge: "bg-orange-500 text-white ring-orange-600/30" },
  { min: 35, label: "P3 · Normal", short: "P3", badge: "bg-slate-700 text-white ring-slate-800/30" },
  { min: 0, label: "P4 · Low", short: "P4", badge: "bg-slate-200 text-slate-800 ring-slate-400/30" },
] as const;

export function priorityBand(score: number) {
  return PRIORITY_BANDS.find((b) => score >= b.min) ?? PRIORITY_BANDS[PRIORITY_BANDS.length - 1];
}

// HEIC is intentionally excluded: mobile browsers transcode camera captures to JPEG on upload,
// and the prebuilt sharp binaries cannot decode HEVC-based images.
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_MEDIA_FILES = 4;
