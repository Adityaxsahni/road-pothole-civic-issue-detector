"use client";

import type * as Leaflet from "leaflet";

declare module "leaflet" {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }
  interface HeatLayer extends Layer {
    setLatLngs(latlngs: Array<[number, number, number?]>): this;
  }
  function heatLayer(latlngs: Array<[number, number, number?]>, options?: HeatLayerOptions): HeatLayer;
}

let loader: Promise<typeof Leaflet> | null = null;

/** Load Leaflet and its plugins once, client-side only (they touch `window` at import time). */
export function loadLeaflet(): Promise<typeof Leaflet> {
  if (!loader) {
    loader = (async () => {
      const L = (await import("leaflet")).default;
      // The UMD plugins attach themselves to the global `L`.
      (window as unknown as { L: typeof Leaflet }).L = L;
      await import("leaflet.markercluster");
      await import("leaflet.heat");
      return L;
    })();
  }
  return loader;
}

export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "&copy; OpenStreetMap contributors";
