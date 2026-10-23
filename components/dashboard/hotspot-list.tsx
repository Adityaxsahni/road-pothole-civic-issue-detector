import { Flame } from "lucide-react";
import { CategoryGlyph } from "@/components/reports/category-icon";
import { cn } from "@/lib/utils";

export interface HotspotItem {
  id: string;
  rank: number;
  label: string;
  issueCount: number;
  openCount: number;
  riskScore: number;
  severityScore: number;
  recommendedAction: string;
  centerLat: number;
  centerLng: number;
  radius: number;
  dominantCategory: { slug: string; name: string } | null;
}

/** Ranked hotspot regions with risk meter and recommended action. */
export function HotspotList({ hotspots, compact = false }: { hotspots: HotspotItem[]; compact?: boolean }) {
  if (hotspots.length === 0) {
    return (
      <p className="text-muted-foreground px-5 py-8 text-center text-sm">
        No hotspots detected yet — clusters appear once 3+ issues are reported within 200 m.
      </p>
    );
  }
  return (
    <ol className="divide-y">
      {hotspots.map((h) => (
        <li key={h.id} className="flex gap-3 px-4 py-3 sm:px-5">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              h.rank <= 3 ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground",
            )}
          >
            {h.rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                <CategoryGlyph
                  icon={h.dominantCategory?.slug ?? "other"}
                  className="text-muted-foreground size-3.5 shrink-0"
                />
                <span className="truncate">{h.label}</span>
              </p>
              <span className="tabular text-muted-foreground shrink-0 text-xs">
                risk <span className="text-foreground font-semibold">{Math.round(h.riskScore)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100" aria-hidden>
              <div
                className="h-full rounded-full bg-[#2a78d6]"
                style={{ width: `${Math.min(100, h.riskScore)}%` }}
              />
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">
              {h.issueCount} issues · {h.openCount} open · {Math.round(h.radius)} m radius
            </p>
            {!compact && (
              <p className="text-foreground mt-1 flex items-start gap-1 text-xs">
                <Flame className="mt-0.5 size-3 shrink-0 text-orange-600" aria-hidden />
                {h.recommendedAction}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
