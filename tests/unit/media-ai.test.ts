import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hammingDistance } from "@/lib/phash";
import { HeuristicDetector } from "@/server/ai/heuristic";
import { sniffFileType } from "@/server/media/file-type";
import { computePhash, processImage } from "@/server/media/process";
import { renderScene, type SceneKind } from "@/server/media/synthetic";

const detector = new HeuristicDetector();

describe("file type sniffing", () => {
  it("identifies images by magic bytes", async () => {
    expect(sniffFileType(await renderScene("pothole", 1, "jpeg"))).toBe("image/jpeg");
    expect(sniffFileType(await renderScene("pothole", 1, "png"))).toBe("image/png");
  });

  it("rejects disguised or unknown content", () => {
    expect(sniffFileType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(sniffFileType(Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // PDF
  });

  it("identifies mp4 containers", () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(8)]);
    expect(sniffFileType(mp4)).toBe("video/mp4");
  });
});

describe("image processing", () => {
  it("normalises, strips metadata and thumbnails", async () => {
    const input = await sharp(await renderScene("pothole", 2, "png"))
      .withMetadata({ exif: { IFD0: { Copyright: "secret-location" } } })
      .jpeg()
      .toBuffer();
    const out = await processImage(input);
    expect(out.width).toBe(640);
    expect(out.phash).toMatch(/^[0-9a-f]{16}$/);
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect((await sharp(out.thumbnail).metadata()).format).toBe("webp");
  });

  it("produces stable perceptual hashes across re-encoding and resizing", async () => {
    const original = await renderScene("trash", 3);
    const resized = await sharp(original).resize(320).jpeg({ quality: 60 }).toBuffer();
    const different = await renderScene("water-leak", 9);
    const [a, b, c] = await Promise.all([
      computePhash(original),
      computePhash(resized),
      computePhash(different),
    ]);
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(6);
    expect(hammingDistance(a, c)).toBeGreaterThan(6);
  });

  it("rejects corrupt images", async () => {
    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
    await expect(processImage(corrupt)).rejects.toThrow();
  });
});

describe("CivicVision-Lite detector", () => {
  const cases: Array<[SceneKind, string]> = [
    ["pothole", "pothole"],
    ["road-crack", "road-crack"],
    ["water-leak", "water-leak"],
    ["blocked-drain", "blocked-drain"],
    ["trash", "trash"],
    ["clean-road", "other"],
  ];

  it.each(cases)("classifies a %s scene as %s", async (scene, expected) => {
    const out = await detector.detect(await renderScene(scene, 1));
    expect(out.label).toBe(expected);
    expect(out.confidence).toBeGreaterThanOrEqual(0.3);
    expect(out.confidence).toBeLessThanOrEqual(0.97);
  });

  it("localises pothole damage with a normalised bounding box and area", async () => {
    const out = await detector.detect(await renderScene("pothole", 4));
    expect(out.boundingBox).not.toBeNull();
    const { x, y, w, h } = out.boundingBox!;
    for (const v of [x, y, w, h]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(y).toBeGreaterThan(0.4); // damage sits on the road surface, not the sky
    expect(out.damageAreaRatio).toBeGreaterThan(0.01);
    expect(out.modelName).toBe("civicvision-lite");
  });
});
