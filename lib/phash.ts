/**
 * Perceptual-hash helpers (pure). Hashes are 64-bit difference hashes (dHash) encoded as
 * 16 hex characters; they are computed server-side in server/media/process.ts.
 */

const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export function isValidHash(hash: string | null | undefined): hash is string {
  return typeof hash === "string" && /^[0-9a-f]{16}$/i.test(hash);
}

/** Number of differing bits between two 64-bit hex hashes (0 = identical, ~32 = unrelated). */
export function hammingDistance(a: string, b: string): number {
  if (!isValidHash(a) || !isValidHash(b)) throw new Error("Invalid perceptual hash");
  let distance = 0;
  for (let i = 0; i < 16; i++) {
    distance += POPCOUNT_NIBBLE[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return distance;
}

/**
 * Similarity in 0..1. Unrelated images average ~32 differing bits, so anything at or beyond
 * 28 bits is treated as no similarity; ≤ 6 bits is effectively the same picture.
 */
export function hashSimilarity(a: string, b: string): number {
  const d = hammingDistance(a, b);
  if (d <= 6) return 1;
  if (d >= 28) return 0;
  return 1 - (d - 6) / 22;
}

/** Best similarity across two sets of hashes, or null when either side has none. */
export function bestHashSimilarity(a: string[], b: string[]): number | null {
  const left = a.filter(isValidHash);
  const right = b.filter(isValidHash);
  if (left.length === 0 || right.length === 0) return null;
  let best = 0;
  for (const x of left) for (const y of right) best = Math.max(best, hashSimilarity(x, y));
  return best;
}

/** Build a dHash from a 9×8 grayscale pixel buffer (row-major, 72 bytes). */
export function dHashFromPixels(pixels: Uint8Array | Buffer): string {
  if (pixels.length < 72) throw new Error("dHash requires a 9x8 grayscale buffer");
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col];
      const right = pixels[row * 9 + col + 1];
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
