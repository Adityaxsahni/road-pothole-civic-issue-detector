"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { loadLeaflet, TILE_ATTRIBUTION, TILE_URL } from "./leaflet-loader";

interface Props {
  value: { latitude: number; longitude: number; accuracy?: number | null } | null;
  onChange: (lat: number, lng: number) => void;
  center: [number, number];
  className?: string;
}

const PIN_HTML = `<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1Z" fill="#1d4ed8" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="#fff"/></svg>`;

/** Tap-to-place / drag-to-adjust location picker. Keyboard users can rely on GPS or the address field. */
export function LocationPicker({ value, onChange, center, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const accuracyRef = useRef<Leaflet.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });
  const [L, setL] = useState<typeof Leaflet | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((leaflet) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = leaflet.map(containerRef.current, {
        center: value ? [value.latitude, value.longitude] : center,
        zoom: value ? 17 : 13,
      });
      leaflet
        .tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, subdomains: "abcd" })
        .addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => onChangeRef.current(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      setL(leaflet);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      accuracyRef.current?.remove();
      accuracyRef.current = null;
      return;
    }
    const pos: [number, number] = [value.latitude, value.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(pos, {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({ html: PIN_HTML, className: "", iconSize: [34, 44], iconAnchor: [17, 43] }),
        title: "Issue location (drag to adjust)",
      }).addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLatLng();
        onChangeRef.current(ll.lat, ll.lng);
      });
    } else {
      markerRef.current.setLatLng(pos);
    }
    accuracyRef.current?.remove();
    accuracyRef.current = null;
    if (value.accuracy && value.accuracy < 500) {
      accuracyRef.current = L.circle(pos, {
        radius: value.accuracy,
        color: "#1d4ed8",
        weight: 1,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
    }
    if (!map.getBounds().pad(-0.2).contains(pos)) map.setView(pos, Math.max(map.getZoom(), 16));
  }, [L, value]);

  return (
    <div className={cn("bg-muted relative isolate overflow-hidden rounded-xl border", className)}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="application"
        aria-label="Map: tap to place the issue location"
      />
      {!L && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Loading map…
        </div>
      )}
    </div>
  );
}
