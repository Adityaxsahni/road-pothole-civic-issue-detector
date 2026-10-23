import type { ReportStatus } from "@prisma/client";
import { Check } from "lucide-react";
import { STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

const FLOW: ReportStatus[] = ["NEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"];

/** Citizen-facing progress through the repair lifecycle. */
export function StatusTracker({ status }: { status: ReportStatus }) {
  if (status === "REJECTED" || status === "DUPLICATE") {
    return (
      <p
        className={cn(
          "rounded-xl px-4 py-3 text-sm",
          status === "REJECTED" ? "bg-slate-100 text-slate-700" : "bg-fuchsia-50 text-fuchsia-900",
        )}
      >
        {status === "REJECTED"
          ? "This report was reviewed and closed as not actionable. See the timeline for details."
          : "This report was merged into an existing report for the same issue. You'll receive its updates."}
      </p>
    );
  }
  const current = FLOW.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Repair progress">
      {FLOW.map((s, i) => {
        const done = i <= current;
        return (
          <li
            key={s}
            className="flex flex-col items-center text-center"
            aria-current={i === current ? "step" : undefined}
          >
            <div className="flex w-full items-center">
              <span
                className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : done ? "bg-primary" : "bg-border")}
              />
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  done
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-muted-foreground",
                  s === "RESOLVED" && done && "border-emerald-600 bg-emerald-600",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === FLOW.length - 1 ? "opacity-0" : i < current ? "bg-primary" : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "mt-1.5 text-[11px] leading-tight",
                done ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {STATUS_META[s].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
