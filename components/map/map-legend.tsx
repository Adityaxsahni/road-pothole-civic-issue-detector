import { SEQUENTIAL_BLUE, SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function MapLegend({ mode, className }: { mode: "markers" | "heat"; className?: string }) {
  return (
    <div
      className={cn("bg-card/95 rounded-xl border px-3 py-2.5 text-xs shadow-md backdrop-blur", className)}
    >
      {mode === "markers" ? (
        <>
          <div className="mb-1.5 hidden font-semibold sm:block">Severity</div>
          {/* Compact single row on phones, stacked list on larger screens. */}
          <ul className="flex gap-3 sm:flex-col sm:gap-1" aria-label="Severity">
            {SEVERITIES.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 rounded-full border-2 border-white shadow"
                  style={{ backgroundColor: SEVERITY_META[s].color }}
                />
                {SEVERITY_META[s].label}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground mt-2 hidden sm:block">Larger dots = higher priority</div>
        </>
      ) : (
        <>
          <div className="mb-1.5 font-semibold">Issue density (severity-weighted)</div>
          <div
            aria-hidden
            className="h-2.5 w-40 rounded-full"
            style={{ background: `linear-gradient(90deg, ${SEQUENTIAL_BLUE.join(",")})` }}
          />
          <div className="text-muted-foreground mt-1 flex justify-between">
            <span>Low</span>
            <span>High</span>
          </div>
        </>
      )}
    </div>
  );
}
