import sharp from "sharp";
import { clamp, round } from "@/lib/utils";
import type { BoundingBox, Detection, DetectionOutput, Detector } from "./types";

/**
 * CivicVision-Lite — a dependency-free classical computer-vision baseline that runs in-process.
 *
 * It looks for the visual signatures of common street defects in the lower (road) part of the
 * frame: compact dark cavities on asphalt (potholes), thin elongated dark strokes (cracks),
 * saturated blue regions (standing/leaking water) and high-colour-diversity clutter (dumped
 * waste). It is a transparent fallback so the product works without a GPU or model weights —
 * point AI_SERVICE_URL at the YOLO service in ai-service/ for learned detections.
 */

const W = 160;
const H = 120;
const ROI_TOP = Math.round(H * 0.28);

interface Component {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  graySum: number;
}

function components(mask: Uint8Array, gray: Float32Array): Component[] {
  const seen = new Uint8Array(mask.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const c: Component = { area: 0, minX: W, minY: H, maxX: 0, maxY: 0, graySum: 0 };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      c.area++;
      c.graySum += gray[i];
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      const n = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of n) {
        if (j >= 0 && mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push(c);
  }
  return out.sort((a, b) => b.area - a.area);
}

/** Triangular membership: 0 outside [lo, hi], 1 across [peakLo, peakHi]. */
function band(v: number, lo: number, peakLo: number, peakHi: number, hi: number): number {
  if (v <= lo || v >= hi) return 0;
  if (v < peakLo) return (v - lo) / (peakLo - lo);
  if (v > peakHi) return (hi - v) / (hi - peakHi);
  return 1;
}

export interface HeuristicFeatures {
  roadRatio: number;
  roadMean: number;
  blobRatio: number;
  blobFill: number;
  blobContrast: number;
  thinDarkRatio: number;
  waterRatio: number;
  clutterRatio: number;
  hueDiversity: number;
  brightness: number;
}

export async function extractFeatures(
  image: Buffer,
): Promise<{ features: HeuristicFeatures; blobBox: BoundingBox | null }> {
  const { data } = await sharp(image, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = W * H;
  const gray = new Float32Array(n);
  const sat = new Float32Array(n);
  const hue = new Float32Array(n);
  let brightness = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    brightness += gray[i];
    sat[i] = max === 0 ? 0 : (max - min) / max;
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    hue[i] = h;
  }
  brightness /= n * 255;

  // Road surface statistics from low-saturation pixels in the region of interest.
  let roadCount = 0;
  let roadSum = 0;
  let roadSq = 0;
  let roiCount = 0;
  let water = 0;
  let clutter = 0;
  const hueBins = new Array<number>(12).fill(0);
  for (let y = ROI_TOP; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      roiCount++;
      if (sat[i] < 0.22 && gray[i] > 25 && gray[i] < 215) {
        roadCount++;
        roadSum += gray[i];
        roadSq += gray[i] * gray[i];
      }
      const isWater = hue[i] >= 185 && hue[i] <= 235 && sat[i] > 0.28 && gray[i] > 40;
      if (isWater) water++;
      else if (sat[i] > 0.42 && gray[i] > 40) {
        clutter++;
        hueBins[Math.floor(hue[i] / 30) % 12]++;
      }
    }
  }
  const roadMean = roadCount ? roadSum / roadCount : 128;
  const roadStd = roadCount ? Math.sqrt(Math.max(0, roadSq / roadCount - roadMean ** 2)) : 40;

  const darkThreshold = Math.min(roadMean - 1.1 * roadStd, roadMean * 0.62);
  const mask = new Uint8Array(n);
  let darkCount = 0;
  for (let y = ROI_TOP; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (gray[i] < darkThreshold && sat[i] < 0.45) {
        mask[i] = 1;
        // Dark cavities are part of the road surface even when too dark for the asphalt band.
        if (!(sat[i] < 0.22 && gray[i] > 25)) darkCount++;
      }
    }
  }

  const comps = components(mask, gray);
  const compact = comps.find(
    (c) => c.area >= 12 && c.area / ((c.maxX - c.minX + 1) * (c.maxY - c.minY + 1)) >= 0.3,
  );
  let blobRatio = 0;
  let blobFill = 0;
  let blobContrast = 0;
  let blobBox: BoundingBox | null = null;
  if (compact) {
    const bw = compact.maxX - compact.minX + 1;
    const bh = compact.maxY - compact.minY + 1;
    blobRatio = compact.area / n;
    blobFill = compact.area / (bw * bh);
    blobContrast = clamp((roadMean - compact.graySum / compact.area) / Math.max(roadMean, 1));
    blobBox = { x: compact.minX / W, y: compact.minY / H, w: bw / W, h: bh / H };
  }
  // Thin, elongated dark structures are the signature of cracking.
  let thin = 0;
  for (const c of comps) {
    if (c === compact || c.area < 6) continue;
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const fill = c.area / (bw * bh);
    const elongation = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    if (fill < 0.3 || elongation > 3) thin += c.area;
  }

  const clutterTotal = hueBins.reduce((a, b) => a + b, 0);
  const hueDiversity = clutterTotal ? hueBins.filter((b) => b / clutterTotal > 0.04).length : 0;

  return {
    features: {
      roadRatio: roiCount ? (roadCount + darkCount) / roiCount : 0,
      roadMean,
      blobRatio,
      blobFill,
      blobContrast,
      thinDarkRatio: thin / n,
      waterRatio: roiCount ? water / roiCount : 0,
      clutterRatio: roiCount ? clutter / roiCount : 0,
      hueDiversity,
      brightness,
    },
    blobBox,
  };
}

export function classify(f: HeuristicFeatures): Record<string, number> {
  const roadContext = clamp(0.35 + f.roadRatio);
  const pothole =
    roadContext *
    band(f.blobRatio, 0.004, 0.03, 0.35, 0.6) *
    clamp(f.blobFill / 0.5) *
    clamp((f.blobContrast - 0.15) / 0.3);
  const crack =
    roadContext * band(f.thinDarkRatio, 0.003, 0.015, 0.12, 0.3) * (1 - 0.6 * clamp(f.blobRatio / 0.08));
  const water = band(f.waterRatio, 0.03, 0.15, 1, 1.01);
  // Debris floating in standing water points to a blocked drain rather than a pipe leak.
  const debris = clamp(f.clutterRatio / 0.02) * clamp(f.hueDiversity / 4);
  const waterLeak = water * (1 - 0.8 * debris);
  const trash = band(f.clutterRatio, 0.04, 0.15, 1, 1.01) * clamp(f.hueDiversity / 5);
  const blockedDrain = Math.min(band(f.waterRatio, 0.04, 0.12, 1, 1.01), debris) * 0.85;
  const streetlight = f.brightness < 0.2 ? clamp((0.2 - f.brightness) / 0.1) * 0.7 : 0;
  return {
    pothole,
    "road-crack": crack,
    "water-leak": waterLeak,
    "blocked-drain": blockedDrain,
    trash,
    "broken-streetlight": streetlight,
    other: 0.22,
  };
}

export class HeuristicDetector implements Detector {
  readonly name = "civicvision-lite";

  async detect(image: Buffer): Promise<DetectionOutput> {
    const started = performance.now();
    const { features, blobBox } = await extractFeatures(image);
    const scores = classify(features);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestLabel, best] = ranked[0];
    const second = ranked[1]?.[1] ?? 0;
    const confidence = bestLabel === "other" ? 0.3 : clamp(0.45 + 0.5 * best - 0.25 * second, 0.3, 0.97);

    const usesBlob = bestLabel === "pothole" || bestLabel === "blocked-drain";
    const bbox = usesBlob ? blobBox : null;
    const detections: Detection[] = ranked
      .filter(([label, score]) => label !== "other" && score >= 0.15)
      .slice(0, 3)
      .map(([label, score]) => ({
        label,
        confidence: round(
          clamp(0.45 + 0.5 * score - (label === bestLabel ? 0.25 * second : 0), 0.3, 0.97),
          3,
        ),
        bbox: label === "pothole" || label === "blocked-drain" ? blobBox : null,
      }));

    return {
      modelName: this.name,
      modelVersion: "1.2.0",
      source: "builtin",
      label: bestLabel,
      confidence: round(confidence, 3),
      damageAreaRatio: usesBlob
        ? round(features.blobRatio, 4)
        : bestLabel === "road-crack"
          ? round(features.thinDarkRatio * 3, 4)
          : null,
      boundingBox: bbox,
      detections,
      latencyMs: Math.round(performance.now() - started),
      raw: {
        features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, round(v, 4)])),
        scores,
      },
    };
  }
}
