export interface BoundingBox {
  /** Normalised 0..1 image coordinates (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  /** Category slug, e.g. "pothole". */
  label: string;
  confidence: number;
  bbox: BoundingBox | null;
}

export interface DetectionOutput {
  modelName: string;
  modelVersion: string;
  source: "remote" | "builtin";
  /** Best-guess category slug for the whole image. */
  label: string;
  confidence: number;
  /** Fraction of the frame covered by the primary damage region, when measurable. */
  damageAreaRatio: number | null;
  boundingBox: BoundingBox | null;
  detections: Detection[];
  latencyMs: number;
  /** Diagnostic features / raw model output, persisted for audit. */
  raw?: Record<string, unknown>;
}

export interface Detector {
  readonly name: string;
  detect(image: Buffer): Promise<DetectionOutput>;
}
