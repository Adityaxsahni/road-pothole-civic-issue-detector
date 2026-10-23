import { describe, expect, it } from "vitest";
import {
  classifyDuplicate,
  findBestDuplicate,
  scoreDuplicate,
  type DedupCandidate,
  type DedupSubject,
} from "@/lib/dedup";

const opts = { radiusM: 60, windowDays: 30 };
const t0 = new Date("2026-05-01T10:00:00Z");

// ~11 m per 0.0001° latitude
const subject: DedupSubject = {
  latitude: 12.9352,
  longitude: 77.6245,
  createdAt: t0,
  categorySlug: "pothole",
  categoryGroup: "road",
  phashes: ["f0f0f0f0f0f0f0f0"],
};

const candidate = (over: Partial<DedupCandidate>): DedupCandidate => ({ ...subject, id: "c1", ...over });

describe("scoreDuplicate", () => {
  it("scores a same-spot, same-day, same-photo report as a duplicate", () => {
    const m = scoreDuplicate(
      subject,
      candidate({ latitude: 12.93521, createdAt: new Date(t0.getTime() + 3_600_000) }),
      opts,
    );
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThanOrEqual(0.9);
    expect(classifyDuplicate(m!.score)).toBe("DUPLICATE");
    expect(m!.reasons.join(" ")).toContain("image similarity");
  });

  it("rejects candidates outside the radius", () => {
    expect(scoreDuplicate(subject, candidate({ latitude: 12.9362 }), opts)).toBeNull(); // ~110 m
  });

  it("rejects candidates outside the time window", () => {
    expect(
      scoreDuplicate(subject, candidate({ createdAt: new Date(t0.getTime() - 31 * 86_400_000) }), opts),
    ).toBeNull();
  });

  it("rejects unrelated categories but accepts related ones with a lower score", () => {
    expect(
      scoreDuplicate(subject, candidate({ categorySlug: "trash", categoryGroup: "sanitation" }), opts),
    ).toBeNull();
    const exact = scoreDuplicate(subject, candidate({}), opts)!;
    const related = scoreDuplicate(subject, candidate({ categorySlug: "road-crack" }), opts)!;
    expect(related.categoryMatch).toBe("group");
    expect(related.score).toBeLessThan(exact.score);
  });

  it("downgrades nearby reports whose photos clearly differ to 'suspected'", () => {
    const m = scoreDuplicate(
      subject,
      candidate({ latitude: 12.93535, phashes: ["0f0f0f0f0f0f0f0f"] }),
      opts,
    )!;
    expect(m.imageSimilarity).toBe(0);
    expect(classifyDuplicate(m.score)).toBe("SUSPECTED");
  });

  it("re-weights toward location when no photo hash is available", () => {
    const m = scoreDuplicate(
      { ...subject, phashes: [] },
      candidate({ latitude: 12.93522, phashes: [] }),
      opts,
    )!;
    expect(m.imageSimilarity).toBeNull();
    expect(classifyDuplicate(m.score)).toBe("DUPLICATE");
  });
});

describe("findBestDuplicate", () => {
  it("picks the highest-scoring candidate", () => {
    const best = findBestDuplicate(
      subject,
      [
        candidate({ id: "far", latitude: 12.93545 }),
        candidate({ id: "near", latitude: 12.93521 }),
        candidate({ id: "out", latitude: 12.95 }),
      ],
      opts,
    );
    expect(best?.candidateId).toBe("near");
  });

  it("returns null when nothing passes the gates", () => {
    expect(findBestDuplicate(subject, [candidate({ latitude: 13 })], opts)).toBeNull();
  });
});

describe("classifyDuplicate", () => {
  it("applies thresholds", () => {
    expect(classifyDuplicate(0.85)).toBe("DUPLICATE");
    expect(classifyDuplicate(0.7)).toBe("SUSPECTED");
    expect(classifyDuplicate(0.3)).toBe("UNIQUE");
  });
});
