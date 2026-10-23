import { describe, expect, it } from "vitest";
import {
  buildHotspots,
  dbscan,
  recommendAction,
  summarizeCluster,
  type HotspotInputPoint,
} from "@/lib/clustering";
import { boundingBox, haversineMeters, isValidCoordinate, nearestNeighborhood } from "@/lib/geo";

describe("geo", () => {
  it("computes haversine distance", () => {
    // Bengaluru MG Road → Koramangala is roughly 5 km.
    const d = haversineMeters(
      { latitude: 12.9756, longitude: 77.605 },
      { latitude: 12.9352, longitude: 77.6245 },
    );
    expect(d).toBeGreaterThan(4500);
    expect(d).toBeLessThan(5200);
  });

  it("builds a bounding box that contains the circle", () => {
    const c = { latitude: 12.97, longitude: 77.59 };
    const box = boundingBox(c, 500);
    expect(haversineMeters(c, { latitude: box.maxLat, longitude: c.longitude })).toBeCloseTo(500, -1);
    expect(haversineMeters(c, { latitude: c.latitude, longitude: box.maxLng })).toBeCloseTo(500, -1);
  });

  it("assigns the nearest neighbourhood within its radius", () => {
    const areas = [
      { id: "a", centerLat: 12.9352, centerLng: 77.6245, radiusM: 2000 },
      { id: "b", centerLat: 12.9784, centerLng: 77.6408, radiusM: 2000 },
    ];
    expect(nearestNeighborhood({ latitude: 12.936, longitude: 77.625 }, areas)?.id).toBe("a");
    expect(nearestNeighborhood({ latitude: 13.2, longitude: 77.2 }, areas)).toBeNull();
  });

  it("validates coordinates", () => {
    expect(isValidCoordinate(12.9, 77.6)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(NaN, 1)).toBe(false);
  });
});

function ring(
  prefix: string,
  lat: number,
  lng: number,
  n: number,
  spreadDeg = 0.0005,
  extra: Partial<HotspotInputPoint> = {},
): HotspotInputPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    latitude: lat + Math.cos(i) * spreadDeg,
    longitude: lng + Math.sin(i) * spreadDeg,
    severityScore: 60,
    open: true,
    categorySlug: "pothole",
    ...extra,
  }));
}

describe("dbscan", () => {
  it("finds dense clusters and ignores noise", () => {
    const points = [
      ...ring("a", 12.93, 77.62, 6),
      ...ring("b", 12.98, 77.64, 4),
      { id: "noise", latitude: 13.05, longitude: 77.5, severityScore: 10, open: true, categorySlug: "trash" },
    ];
    const clusters = dbscan(points, 200, 3);
    expect(clusters).toHaveLength(2);
    expect(clusters.flat()).not.toContain(points.length - 1);
  });

  it("returns no clusters below minPts", () => {
    expect(dbscan(ring("a", 12.93, 77.62, 2), 200, 3)).toHaveLength(0);
  });
});

describe("hotspots", () => {
  it("summarises a cluster with dominant category and risk", () => {
    const pts = [
      ...ring("p", 12.93, 77.62, 5),
      ...ring("t", 12.93, 77.62, 2, 0.0003, { categorySlug: "trash", open: false }),
    ];
    const s = summarizeCluster(pts);
    expect(s.issueCount).toBe(7);
    expect(s.openCount).toBe(5);
    expect(s.dominantCategory).toBe("pothole");
    expect(s.radius).toBeGreaterThanOrEqual(50);
    expect(s.riskScore).toBeGreaterThan(0);
    expect(s.recommendedAction).toMatch(/patching|resurfacing/i);
  });

  it("ranks larger, more severe clusters first", () => {
    const hot = ring("h", 12.93, 77.62, 10, 0.0005, { severityScore: 85 });
    const mild = ring("m", 12.99, 77.55, 3, 0.0005, { severityScore: 30 });
    const ranked = buildHotspots([...mild, ...hot]);
    expect(ranked[0].reportIds).toContain("h0");
  });

  it("recommends category-specific actions", () => {
    expect(recommendAction("open-manhole", 1, 1)).toMatch(/barricade/i);
    expect(recommendAction("pothole", 12, 10)).toMatch(/resurfacing/i);
    expect(recommendAction("blocked-drain", 3, 3)).toMatch(/drain/i);
  });
});
