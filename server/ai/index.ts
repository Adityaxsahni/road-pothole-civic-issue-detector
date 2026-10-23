import "server-only";
import { env } from "../env";
import { HeuristicDetector } from "./heuristic";
import { RemoteDetector } from "./remote";
import type { DetectionOutput } from "./types";

const builtin = new HeuristicDetector();

/**
 * Run image analysis. Uses the remote YOLO service when AI_SERVICE_URL is configured and falls
 * back to the in-process CivicVision-Lite analyzer if it is unset, slow or failing — so report
 * submission never blocks on model availability.
 */
export async function analyzeImage(image: Buffer): Promise<DetectionOutput> {
  const { AI_SERVICE_URL, AI_SERVICE_TIMEOUT_MS } = env();
  if (AI_SERVICE_URL) {
    try {
      return await new RemoteDetector(AI_SERVICE_URL, AI_SERVICE_TIMEOUT_MS).detect(image);
    } catch (err) {
      console.warn(`[ai] remote detector unavailable, falling back to builtin: ${(err as Error).message}`);
    }
  }
  return builtin.detect(image);
}

export type { BoundingBox, Detection, DetectionOutput } from "./types";
