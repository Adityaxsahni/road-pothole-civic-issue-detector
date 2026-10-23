"use client";

import { Flame, Layers, ListFilter, MapPin, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SeverityBadge } from "@/components/reports/badges";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { OPEN_STATUSES, SEVERITIES, SEVERITY_META, STATUS_META, STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { IssueMap, type HotspotView, type MapPointView } from "./issue-map";
import { MapLegend } from "./map-legend";

interface Props {
  categories: Array<{ slug: string; name: string }>;
  center: [number, number];
  zoom: number;
  linkBase?: string;
  showList?: boolean;
  className?: string;
}

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function MapExplorer({ categories, center, zoom, linkBase, showList = false, className }: Props) {
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState<string[]>([]);
  const [status, setStatus] = useState("open");
  const [range, setRange] = useState("90");
  const [mode, setMode] = useState<"markers" | "heat">("markers");
  const [showHotspots, setShowHotspots] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hotspots, setHotspots] = useState<HotspotView[]>([]);
  const [attempt, setAttempt] = useState(0);
  // Results are tagged with the request they answer, so "loading" is derived rather than toggled.
  const [result, setResult] = useState<{ key: string; points: MapPointView[]; error: string | null } | null>(
    null,
  );

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (severity.length) p.set("severity", severity.join(","));
    if (status === "open") p.set("status", OPEN_STATUSES.join(","));
    else if (status !== "all") p.set("status", status);
    if (range !== "all") p.set("days", range);
    return p.toString();
  }, [category, severity, status, range]);
  const requestKey = `${query}#${attempt}`;

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams(query);
    const days = params.get("days");
    params.delete("days");
    if (days) params.set("from", new Date(Date.now() - Number(days) * 86_400_000).toISOString().slice(0, 10));
    fetch(`/api/map?${params.toString()}`, { cache: "no-store", signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => setResult({ key: requestKey, points: data.points, error: null }))
      .catch((err) => {
        if (!ctrl.signal.aborted)
          setResult((prev) => ({
            key: requestKey,
            points: prev?.points ?? [],
            error: `Could not load issues (${err.message}).`,
          }));
      });
    return () => ctrl.abort();
  }, [query, requestKey]);

  const loading = result?.key !== requestKey;
  const points = useMemo(() => result?.points ?? [], [result]);
  const error = loading ? null : (result?.error ?? null);
  const load = () => setAttempt((a) => a + 1);

  useEffect(() => {
    fetch("/api/hotspots")
      .then((r) => (r.ok ? r.json() : { hotspots: [] }))
      .then((d) => setHotspots(d.hotspots))
      .catch(() => setHotspots([]));
  }, []);

  const toggleSeverity = (s: string) =>
    setSeverity((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const critical = points.filter((p) => p.severity === "CRITICAL").length;
  const top = useMemo(() => [...points].sort((a, b) => b.priority - a.priority).slice(0, 12), [points]);
  const activeFilters =
    (category ? 1 : 0) + severity.length + (status !== "open" ? 1 : 0) + (range !== "90" ? 1 : 0);

  const filters = (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:gap-2">
        <label className="sr-only" htmlFor="map-category">
          Issue type
        </label>
        <NativeSelect
          id="map-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="lg:w-44"
        >
          <option value="">All issue types</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <label className="sr-only" htmlFor="map-status">
          Status
        </label>
        <NativeSelect
          id="map-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="lg:w-40"
        >
          <option value="open">Open issues</option>
          <option value="all">All statuses</option>
          {STATUSES.filter((s) => s !== "DUPLICATE" && s !== "REJECTED").map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </NativeSelect>
        <label className="sr-only" htmlFor="map-range">
          Date range
        </label>
        <NativeSelect
          id="map-range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="lg:w-40"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Severity</legend>
        {SEVERITIES.map((s) => {
          const active = severity.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSeverity(s)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: SEVERITY_META[s].color }}
              />
              {SEVERITY_META[s].label}
            </button>
          );
        })}
      </fieldset>
    </div>
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="bg-card border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium" aria-live="polite">
              {loading ? "Loading issues…" : `${points.length} issue${points.length === 1 ? "" : "s"} shown`}
              {!loading && critical > 0 && <span className="ml-2 text-red-700">· {critical} critical</span>}
            </p>
          </div>
          <div className="bg-muted inline-flex rounded-lg border p-0.5" role="group" aria-label="Map layer">
            <button
              type="button"
              aria-pressed={mode === "markers"}
              onClick={() => setMode("markers")}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                mode === "markers" && "bg-card shadow-sm",
              )}
            >
              <MapPin className="size-3.5" /> <span className="hidden sm:inline">Markers</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === "heat"}
              onClick={() => setMode("heat")}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                mode === "heat" && "bg-card shadow-sm",
              )}
            >
              <Flame className="size-3.5" /> <span className="hidden sm:inline">Heatmap</span>
            </button>
          </div>
          <Button
            variant={showHotspots ? "secondary" : "outline"}
            size="sm"
            aria-pressed={showHotspots}
            onClick={() => setShowHotspots((v) => !v)}
            className="h-9"
          >
            <Layers /> <span className="hidden sm:inline">Hotspots</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <ListFilter /> Filters
            {activeFilters > 0 && (
              <span className="bg-primary rounded-full px-1.5 text-[10px] text-white">{activeFilters}</span>
            )}
          </Button>
        </div>
        <div className={cn("mt-3", filtersOpen ? "block" : "hidden lg:block")}>{filters}</div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <IssueMap
          points={points}
          hotspots={hotspots}
          center={center}
          zoom={zoom}
          mode={mode}
          showHotspots={showHotspots}
          linkBase={linkBase}
          className="min-h-[420px] flex-1"
        />
        <MapLegend mode={mode} className="absolute bottom-6 left-3 z-[400]" />
        {error && (
          <div className="bg-card absolute top-4 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow">
            {error}
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw /> Retry
            </Button>
          </div>
        )}
        {showList && (
          <aside
            className="bg-card hidden w-80 shrink-0 overflow-y-auto border-l xl:block"
            aria-label="Highest priority issues in view"
          >
            <div className="bg-card sticky top-0 border-b px-4 py-3 text-sm font-semibold">
              Highest priority
            </div>
            <ul>
              {top.map((p) => (
                <li key={p.id} className="border-b last:border-0">
                  <Link href={`${linkBase ?? "#"}${p.id}`} className="hover:bg-muted block px-4 py-3">
                    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span>
                        {p.refCode} · {p.categoryName}
                      </span>
                      <span className="tabular text-foreground font-semibold">{Math.round(p.priority)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm font-medium">{p.title}</div>
                    <div className="mt-1.5">
                      <SeverityBadge severity={p.severity} />
                    </div>
                  </Link>
                </li>
              ))}
              {!loading && top.length === 0 && (
                <li className="text-muted-foreground px-4 py-8 text-center text-sm">No issues match.</li>
              )}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
