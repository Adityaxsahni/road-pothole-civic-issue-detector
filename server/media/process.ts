import sharp from "sharp";
import { dHashFromPixels } from "@/lib/phash";

export interface ProcessedImage {
  /** Normalised JPEG: auto-rotated, ≤ 2048px, all metadata (incl. EXIF GPS) stripped. */
  data: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  phash: string;
}

const MAX_INPUT_PIXELS = 60_000_000;

export async function computePhash(input: Buffer): Promise<string> {
  const pixels = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  return dHashFromPixels(pixels);
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
  const { data, info } = await base
    .clone()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(data)
    .resize({ width: 480, height: 480, fit: "inside" })
    .webp({ quality: 72 })
    .toBuffer();
  const phash = await computePhash(data);
  return { data, thumbnail, width: info.width, height: info.height, phash };
}
