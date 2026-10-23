"use client";

import { useEffect, useState } from "react";
import { OPEN_STATUSES } from "@/lib/constants";
import { IssueMap, type HotspotView, type MapPointView } from "./issue-map";
import { MapLegend } from "./map-legend";

/** Read-only map of currently open issues for the landing page. */
export function LiveMapPreview({ center, zoom }: { center: [number, number]; zoom: number }) {
  const [points, setPoints] = useState<MapPointView[]>([]);
  const [hotspots, setHotspots] = useState<HotspotView[]>([]);

  useEffect(() => {
    fetch(`/api/map?status=${OPEN_STATUSES.join(",")}`)
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((d) => setPoints(d.points))
      .catch(() => {});
    fetch("/api/hotspots")
      .then((r) => (r.ok ? r.json() : { hotspots: [] }))
      .then((d) => setHotspots(d.hotspots.slice(0, 5)))
      .catch(() => {});
  }, []);

  return (
    <div className="relative h-full">
      <IssueMap
        points={points}
        hotspots={hotspots}
        center={center}
        zoom={zoom}
        className="h-full"
        ariaLabel="Live map of open issues"
      />
      <MapLegend mode="markers" className="absolute bottom-4 left-3 z-[400] hidden sm:block" />
    </div>
  );
}
