export interface WizardCategory {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface DetectionSuggestion {
  label: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  severityScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  boundingBox: { x: number; y: number; w: number; h: number } | null;
  damageAreaRatio: number | null;
  modelName: string;
  modelVersion: string;
  source: "remote" | "builtin";
  latencyMs: number;
  alternatives: Array<{ label: string; confidence: number }>;
}

export interface MediaItem {
  id: string;
  file: File;
  previewUrl: string;
  kind: "image" | "video";
  /** JPEG frame extracted from a video, used for AI analysis and as the report thumbnail. */
  poster?: Blob | null;
  posterUrl?: string | null;
}

export interface WizardLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type RoadType = "HIGHWAY" | "ARTERIAL" | "COLLECTOR" | "LOCAL" | "UNKNOWN";
export type TrafficLevel = "HEAVY" | "MODERATE" | "LOW" | "UNKNOWN";

export interface WizardState {
  media: MediaItem[];
  detection: DetectionSuggestion | null;
  detectionStatus: "idle" | "running" | "done" | "error";
  categorySlug: string | null;
  location: WizardLocation | null;
  address: string;
  roadType: RoadType;
  trafficLevel: TrafficLevel;
  title: string;
  description: string;
  notes: string;
}
