export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Axis-aligned box that fully contains a circle of `radiusM` — used as an indexed SQL pre-filter. */
export function boundingBox(center: LatLng, radiusM: number): BoundingBox {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(toRad(center.latitude)), 1e-6);
  return {
    minLat: center.latitude - dLat,
    maxLat: center.latitude + dLat,
    minLng: center.longitude - dLng,
    maxLng: center.longitude + dLng,
  };
}

export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) throw new Error("centroid of empty set");
  const sum = points.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    {
      latitude: 0,
      longitude: 0,
    },
  );
  return { latitude: sum.latitude / points.length, longitude: sum.longitude / points.length };
}

export interface NeighborhoodArea {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
}

/** Nearest neighbourhood centroid whose service radius contains the point (simple Voronoi assignment). */
export function nearestNeighborhood<T extends NeighborhoodArea>(point: LatLng, areas: T[]): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const area of areas) {
    const d = haversineMeters(point, { latitude: area.centerLat, longitude: area.centerLng });
    if (d <= area.radiusM && d < bestDistance) {
      best = area;
      bestDistance = d;
    }
  }
  return best;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}
