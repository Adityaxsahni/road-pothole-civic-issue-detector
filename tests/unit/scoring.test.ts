import { describe, expect, it } from "vitest";
import {
  computePriority,
  computeSeverity,
  PRIORITY_WEIGHTS,
  severityLevel,
  type PriorityInput,
} from "@/lib/scoring";

describe("severityLevel", () => {
  it.each([
    [0, "LOW"],
    [34.9, "LOW"],
    [35, "MEDIUM"],
    [60, "HIGH"],
    [80, "CRITICAL"],
    [100, "CRITICAL"],
  ])("maps %s to %s", (score, level) => {
    expect(severityLevel(score)).toBe(level);
  });
});

describe("computeSeverity", () => {
  it("falls back to the category base without a detection", () => {
    expect(computeSeverity({ categoryBase: 70 })).toEqual({ score: 70, level: "HIGH" });
  });

  it("ignores the damage estimate when the AI disagrees with the category", () => {
    const s = computeSeverity({ categoryBase: 50, aiConfidence: 0.9, damageAreaRatio: 0.3, aiAgrees: false });
    expect(s.score).toBe(50);
  });

  it("raises severity for large, confidently detected damage", () => {
    const small = computeSeverity({
      categoryBase: 70,
      aiConfidence: 0.9,
      damageAreaRatio: 0.005,
      aiAgrees: true,
    });
    const large = computeSeverity({
      categoryBase: 70,
      aiConfidence: 0.9,
      damageAreaRatio: 0.3,
      aiAgrees: true,
    });
    expect(large.score).toBeGreaterThan(70);
    expect(small.score).toBeLessThan(70);
    expect(large.level).toBe("CRITICAL");
  });

  it("damps the adjustment when confidence is low", () => {
    const confident = computeSeverity({
      categoryBase: 60,
      aiConfidence: 0.95,
      damageAreaRatio: 0.3,
      aiAgrees: true,
    });
    const unsure = computeSeverity({
      categoryBase: 60,
      aiConfidence: 0.2,
      damageAreaRatio: 0.3,
      aiAgrees: true,
    });
    expect(confident.score - 60).toBeGreaterThan(unsure.score - 60);
  });

  it("stays within 0..100", () => {
    expect(
      computeSeverity({ categoryBase: 100, aiConfidence: 1, damageAreaRatio: 1, aiAgrees: true }).score,
    ).toBeLessThanOrEqual(100);
    expect(
      computeSeverity({ categoryBase: 0, aiConfidence: 1, damageAreaRatio: 0, aiAgrees: true }).score,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("computePriority", () => {
  const base: PriorityInput = {
    severityScore: 60,
    roadType: "COLLECTOR",
    trafficLevel: "MODERATE",
    confidence: 0.8,
    nearbyReportCount: 2,
    nearbyHighSeverityRatio: 0.2,
    inHotspot: false,
    duplicateCount: 0,
    ageHours: 12,
    slaHours: 72,
  };

  it("weights sum to 1", () => {
    const total = Object.values(PRIORITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("returns an explainable breakdown whose contributions add up to the score", () => {
    const result = computePriority(base);
    expect(result.factors).toHaveLength(8);
    const sum = result.factors.reduce((s, f) => s + f.contribution, 0);
    expect(result.score).toBeCloseTo(sum, 0);
  });

  it("ranks a critical pothole on a busy highway above a minor issue on a quiet lane", () => {
    const urgent = computePriority({
      ...base,
      severityScore: 92,
      roadType: "HIGHWAY",
      trafficLevel: "HEAVY",
      inHotspot: true,
      nearbyHighSeverityRatio: 0.8,
      duplicateCount: 4,
    });
    const minor = computePriority({ ...base, severityScore: 20, roadType: "LOCAL", trafficLevel: "LOW" });
    expect(urgent.score).toBeGreaterThanOrEqual(80);
    expect(minor.score).toBeLessThan(40);
  });

  it("increases with citizen corroboration and SLA pressure", () => {
    const fresh = computePriority(base).score;
    expect(computePriority({ ...base, duplicateCount: 3 }).score).toBeGreaterThan(fresh);
    expect(computePriority({ ...base, ageHours: 200 }).score).toBeGreaterThan(fresh);
  });

  it("is bounded to 0..100", () => {
    const max = computePriority({
      ...base,
      severityScore: 100,
      roadType: "HIGHWAY",
      trafficLevel: "HEAVY",
      confidence: 1,
      nearbyReportCount: 999,
      nearbyHighSeverityRatio: 1,
      inHotspot: true,
      duplicateCount: 99,
      ageHours: 9999,
    });
    expect(max.score).toBeLessThanOrEqual(100);
    expect(max.score).toBeGreaterThan(99);
  });
});
