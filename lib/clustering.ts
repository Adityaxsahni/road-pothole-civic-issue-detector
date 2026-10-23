import { centroid, haversineMeters, type LatLng } from "./geo";
import { clamp, round } from "./utils";

export interface ClusterPoint extends LatLng {
  id: string;
}

/**
 * DBSCAN over geographic points using haversine distance. Returns clusters of point indexes;
 * noise points are omitted. A grid index keyed by ~eps-sized cells keeps neighbour lookups
 * near-linear for city-scale datasets.
 */
export function dbscan<T extends LatLng>(points: T[], epsM: number, minPts: number): number[][] {
  const cellDeg = epsM / 111_320;
  const key = (p: LatLng) => `${Math.floor(p.latitude / cellDeg)}:${Math.floor(p.longitude / cellDeg)}`;
  const grid = new Map<string, number[]>();
  points.forEach((p, i) => {
    const k = key(p);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });

  const neighbours = (i: number): number[] => {
    const p = points[i];
    const cy = Math.floor(p.latitude / cellDeg);
    // Longitude degrees shrink with latitude, so widen the horizontal search accordingly.
    const lngSpan = Math.ceil(1 / Math.max(Math.cos((p.latitude * Math.PI) / 180), 0.1));
    const cx = Math.floor(p.longitude / cellDeg);
    const result: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -lngSpan; dx <= lngSpan; dx++) {
        const bucket = grid.get(`${cy + dy}:${cx + dx}`);
        if (!bucket) continue;
        for (const j of bucket) if (haversineMeters(p, points[j]) <= epsM) result.push(j);
      }
    }
    return result;
  };

  const UNVISITED = -2;
  const NOISE = -1;
  const labels = new Array<number>(points.length).fill(UNVISITED);
  const clusters: number[][] = [];

  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== UNVISITED) continue;
    const seeds = neighbours(i);
    if (seeds.length < minPts) {
      labels[i] = NOISE;
      continue;
    }
    const clusterId = clusters.length;
    const members: number[] = [];
    clusters.push(members);
    labels[i] = clusterId;
    members.push(i);
    const queue = seeds.filter((j) => j !== i);
    while (queue.length) {
      const j = queue.pop()!;
      if (labels[j] === NOISE) {
        labels[j] = clusterId;
        members.push(j);
      }
      if (labels[j] !== UNVISITED) continue;
      labels[j] = clusterId;
      members.push(j);
      const next = neighbours(j);
      if (next.length >= minPts) queue.push(...next);
    }
  }
  return clusters;
}

export interface HotspotInputPoint extends ClusterPoint {
  severityScore: number;
  open: boolean;
  categorySlug: string;
}

export interface HotspotSummary {
  centerLat: number;
  centerLng: number;
  radius: number;
  issueCount: number;
  openCount: number;
  severityScore: number;
  riskScore: number;
  dominantCategory: string;
  reportIds: string[];
  recommendedAction: string;
}

export function summarizeCluster(points: HotspotInputPoint[]): HotspotSummary {
  const center = centroid(points);
  const radius = Math.max(50, ...points.map((p) => haversineMeters(center, p)));
  const openCount = points.filter((p) => p.open).length;
  const severityScore = points.reduce((s, p) => s + p.severityScore, 0) / points.length;

  const counts = new Map<string, number>();
  for (const p of points) counts.set(p.categorySlug, (counts.get(p.categorySlug) ?? 0) + 1);
  const dominantCategory = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];

  // Risk rewards severity, volume (log-saturating at ~30 issues) and the share still unresolved.
  const volume = clamp(Math.log1p(points.length) / Math.log1p(30));
  const riskScore = 0.45 * severityScore + 0.35 * volume * 100 + 0.2 * (openCount / points.length) * 100;

  return {
    centerLat: round(center.latitude, 6),
    centerLng: round(center.longitude, 6),
    radius: round(radius, 0),
    issueCount: points.length,
    openCount,
    severityScore: round(severityScore),
    riskScore: round(riskScore),
    dominantCategory,
    reportIds: points.map((p) => p.id),
    recommendedAction: recommendAction(dominantCategory, points.length, openCount),
  };
}

/** Rank hotspots for maintenance planning, highest risk first. */
export function buildHotspots(points: HotspotInputPoint[], epsM = 200, minPts = 3): HotspotSummary[] {
  return dbscan(points, epsM, minPts)
    .map((members) => summarizeCluster(members.map((i) => points[i])))
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function recommendAction(categorySlug: string, issueCount: number, openCount: number): string {
  const large = issueCount >= 8;
  switch (categorySlug) {
    case "pothole":
    case "road-crack":
      return large
        ? "Schedule full-width resurfacing of this corridor instead of spot patching"
        : "Dispatch a patching crew for cold-mix pothole repairs";
    case "open-manhole":
      return "Barricade immediately and replace missing covers; audit nearby chambers";
    case "blocked-drain":
      return large
        ? "Desilt the storm-water drain network before the next heavy rain"
        : "Clear blocked inlets and inspect drain gradients";
    case "water-leak":
      return "Run a pipeline leak survey with the water utility";
    case "trash":
      return large
        ? "Increase collection frequency and add CCTV/signage against illegal dumping"
        : "Schedule a clean-up drive and add a community bin";
    case "fallen-sign":
    case "broken-streetlight":
      return "Commission a street-furniture and lighting audit for the area";
    default:
      return openCount > 0 ? "Send a field inspector to assess the cluster" : "Monitor for recurrence";
  }
}
