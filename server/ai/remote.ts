import { z } from "zod";
import type { DetectionOutput, Detector } from "./types";

const bbox = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable();

const responseSchema = z.object({
  model_name: z.string(),
  model_version: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  damage_area_ratio: z.number().min(0).max(1).nullable().optional(),
  bbox: bbox.optional(),
  detections: z
    .array(z.object({ label: z.string(), confidence: z.number().min(0).max(1), bbox: bbox.optional() }))
    .default([]),
  latency_ms: z.number().optional(),
});

/** Client for the FastAPI/YOLO inference service in ai-service/. */
export class RemoteDetector implements Detector {
  readonly name = "remote";

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async detect(image: Buffer): Promise<DetectionOutput> {
    const started = performance.now();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "image.jpg");
    const res = await fetch(`${this.baseUrl}/detect`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`AI service responded ${res.status}`);
    const parsed = responseSchema.parse(await res.json());
    return {
      modelName: parsed.model_name,
      modelVersion: parsed.model_version,
      source: "remote",
      label: parsed.label,
      confidence: parsed.confidence,
      damageAreaRatio: parsed.damage_area_ratio ?? null,
      boundingBox: parsed.bbox ?? parsed.detections[0]?.bbox ?? null,
      detections: parsed.detections.map((d) => ({
        label: d.label,
        confidence: d.confidence,
        bbox: d.bbox ?? null,
      })),
      latencyMs: Math.round(parsed.latency_ms ?? performance.now() - started),
      raw: { detections: parsed.detections },
    };
  }
}
