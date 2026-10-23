"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { PRIORITY_BANDS, SEQUENTIAL_BLUE, SEVERITY_META, STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { loadLeaflet, TILE_ATTRIBUTION, TILE_URL } from "./leaflet-loader";

export interface MapPointView {
  id: string;
  refCode: string;
  title: string;
  lat: number;
  lng: number;
  status: keyof typeof STATUS_META;
  severity: keyof typeof SEVERITY_META;
  priority: number;
  categoryName: string;
  duplicateCount: number;
}

export interface HotspotView {
  id: string;
  rank: number;
  label: string;
  centerLat: number;
  centerLng: number;
  radius: number;
  issueCount: number;
  riskScore: number;
  recommendedAction: string;
}

export interface IssueMapProps {
  points: MapPointView[];
  hotspots?: HotspotView[];
  center: [number, number];
  zoom: number;
  mode?: "markers" | "heat";
  showHotspots?: boolean;
  /** When set, popups link to `${linkBase}${id}`. */
  linkBase?: string;
  fitToPoints?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Ink colour with enough contrast on a given fill. */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.3 ? "#0b1220" : "#ffffff";
}

const RANK: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const BY_RANK = ["LOW", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function popupContent(p: MapPointView, linkBase?: string): HTMLElement {
  // Built with DOM APIs (never innerHTML) because titles are user-provided.
  const root = document.createElement("div");
  root.style.minWidth = "200px";
  const ref = document.createElement("div");
  ref.textContent = `${p.refCode} · ${p.categoryName}`;
  ref.style.cssText = "font-size:11px;color:#586174;margin-bottom:2px";
  const title = document.createElement("div");
  title.textContent = p.title;
  title.style.cssText = "font-weight:600;font-size:14px;margin-bottom:6px";
  const meta = document.createElement("div");
  meta.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px";
  const sev = document.createElement("span");
  sev.style.cssText = "display:inline-flex;align-items:center;gap:4px";
  const dot = document.createElement("span");
  dot.style.cssText = `width:8px;height:8px;border-radius:9999px;background:${SEVERITY_META[p.severity].color}`;
  sev.append(dot, document.createTextNode(`${SEVERITY_META[p.severity].label} severity`));
  const status = document.createElement("span");
  status.textContent = `· ${STATUS_META[p.status].label}`;
  const band = PRIORITY_BANDS.find((b) => p.priority >= b.min)!;
  const prio = document.createElement("span");
  prio.textContent = `· ${band.short} (${Math.round(p.priority)})`;
  meta.append(sev, status, prio);
  root.append(ref, title, meta);
  if (p.duplicateCount > 0) {
    const dup = document.createElement("div");
    dup.textContent = `Reported by ${p.duplicateCount + 1} citizens`;
    dup.style.cssText = "font-size:12px;color:#1e40af;margin-top:4px";
    root.append(dup);
  }
  if (linkBase) {
    const a = document.createElement("a");
    a.href = `${linkBase}${p.id}`;
    a.textContent = "Open report →";
    a.style.cssText = "display:inline-block;margin-top:8px;font-weight:600;color:#1d4ed8";
    root.append(a);
  }
  return root;
}

export function IssueMap({
  points,
  hotspots = [],
  center,
  zoom,
  mode = "markers",
  showHotspots = true,
  linkBase,
  fitToPoints = false,
  className,
  ariaLabel = "Map of reported issues",
}: IssueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<{ data?: Leaflet.Layer; hotspots?: Leaflet.LayerGroup }>({});
  const fittedRef = useRef(false);
  const [L, setL] = useState<typeof Leaflet | null>(null);
  const [failed, setFailed] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = leaflet.map(containerRef.current, {
          center,
          zoom,
          zoomControl: true,
          preferCanvas: true,
        });
        leaflet
          .tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, subdomains: "abcd" })
          .addTo(map);
        mapRef.current = map;
        setL(leaflet);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = {};
      fittedRef.current = false;
    };
    // Center/zoom are initial values only; later changes are handled by fitToPoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data layer: clustered markers or heatmap.
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    if (layersRef.current.data) map.removeLayer(layersRef.current.data);

    let layer: Leaflet.Layer;
    if (mode === "heat") {
      const weight: Record<string, number> = { LOW: 0.35, MEDIUM: 0.55, HIGH: 0.8, CRITICAL: 1 };
      layer = L.heatLayer(
        points.map((p) => [p.lat, p.lng, weight[p.severity]]),
        {
          radius: 22,
          blur: 18,
          maxZoom: 15,
          minOpacity: 0.35,
          gradient: {
            0.15: SEQUENTIAL_BLUE[0],
            0.35: SEQUENTIAL_BLUE[2],
            0.55: SEQUENTIAL_BLUE[3],
            0.75: SEQUENTIAL_BLUE[5],
            1: SEQUENTIAL_BLUE[6],
          },
        },
      );
    } else {
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 48,
        spiderfyOnMaxZoom: true,
        chunkedLoading: true,
        iconCreateFunction: (c) => {
          const children = c.getAllChildMarkers() as Array<
            Leaflet.Marker & { options: { severityRank?: number } }
          >;
          const maxRank = Math.max(...children.map((m) => m.options.severityRank ?? 1));
          const color = SEVERITY_META[BY_RANK[maxRank]].color;
          const count = c.getChildCount();
          const size = count < 10 ? 34 : count < 50 ? 40 : 48;
          return L.divIcon({
            html: `<div class="cp-cluster" style="width:${size}px;height:${size}px;background:${color};color:${inkFor(color)}">${count}</div>`,
            className: "",
            iconSize: [size, size],
          });
        },
      });
      for (const p of points) {
        const color = SEVERITY_META[p.severity].color;
        const size = p.priority >= 75 ? 18 : p.priority >= 55 ? 15 : 12;
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            html: `<div class="cp-marker" style="width:${size}px;height:${size}px;background:${color}"></div>`,
            className: "",
            iconSize: [size, size],
          }),
          keyboard: true,
          title: `${p.refCode}: ${SEVERITY_META[p.severity].label} severity ${p.categoryName}`,
          alt: p.categoryName,
          severityRank: RANK[p.severity],
        } as Leaflet.MarkerOptions & { severityRank: number });
        marker.bindPopup(() => popupContent(p, linkBase));
        cluster.addLayer(marker);
      }
      layer = cluster;
    }
    layer.addTo(map);
    layersRef.current.data = layer;

    if (fitToPoints && !fittedRef.current && points.length > 0) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [32, 32], maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [L, points, mode, linkBase, fitToPoints]);

  // Hotspot overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    if (layersRef.current.hotspots) map.removeLayer(layersRef.current.hotspots);
    if (!showHotspots || hotspots.length === 0) return;
    const group = L.layerGroup();
    for (const h of hotspots) {
      const circle = L.circle([h.centerLat, h.centerLng], {
        radius: Math.max(h.radius, 80),
        color: "#1d4ed8",
        weight: 2,
        fillColor: "#3987e5",
        fillOpacity: 0.08,
        interactive: true,
      });
      const tip = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = `#${h.rank} ${h.label}`;
      const detail = document.createElement("div");
      detail.textContent = `${h.issueCount} issues · risk ${Math.round(h.riskScore)}`;
      const action = document.createElement("div");
      action.textContent = h.recommendedAction;
      action.style.cssText = "max-width:240px;white-space:normal;color:#586174;margin-top:2px";
      tip.append(strong, detail, action);
      circle.bindTooltip(tip, { sticky: true });
      group.addLayer(circle);
    }
    group.addTo(map);
    layersRef.current.hotspots = group;
  }, [L, hotspots, showHotspots]);

  return (
    <div className={cn("bg-muted relative isolate overflow-hidden", className)}>
      <div ref={containerRef} className="absolute inset-0" role="region" aria-label={ariaLabel} />
      {!L && !failed && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Loading map…
        </div>
      )}
      {failed && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
          The map could not be loaded. Check your connection and refresh.
        </div>
      )}
    </div>
  );
}
