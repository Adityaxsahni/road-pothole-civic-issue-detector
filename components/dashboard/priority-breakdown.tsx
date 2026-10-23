import { priorityBand } from "@/lib/constants";
import type { PriorityFactor } from "@/lib/scoring";

/** Explainable priority: each factor's normalised value and its points contribution. */
export function PriorityBreakdown({ score, factors }: { score: number; factors: PriorityFactor[] }) {
  const band = priorityBand(score);
  const sorted = [...factors].sort((a, b) => b.contribution - a.contribution);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-4xl font-semibold tracking-tight">{Math.round(score)}</p>
          <p className="text-muted-foreground text-sm">{band.label}</p>
        </div>
        <p className="text-muted-foreground max-w-[180px] text-right text-xs">
          Weighted sum of the factors below (0–100)
        </p>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {sorted.map((f) => (
          <li key={f.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{f.label}</span>
              <span className="tabular text-muted-foreground">
                <span className="text-foreground font-semibold">+{f.contribution.toFixed(1)}</span> /{" "}
                {Math.round(f.weight * 100)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100" aria-hidden>
              <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${f.value * 100}%` }} />
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">{f.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
