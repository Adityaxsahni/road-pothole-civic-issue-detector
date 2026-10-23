import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Signed change vs the previous period, with whether "up" is good for this metric. */
  delta?: { value: number; label: string; upIsGood: boolean };
  hint?: string;
  tone?: "default" | "critical" | "warning";
}) {
  const up = delta && delta.value > 0;
  const good = delta && (delta.value === 0 ? null : up === delta.upIsGood);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-sm">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            tone === "critical"
              ? "bg-red-50 text-red-700"
              : tone === "warning"
                ? "bg-amber-50 text-amber-700"
                : "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {delta ? (
        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center font-medium",
              good === true && "text-[#006300]",
              good === false && "text-red-700",
            )}
          >
            {delta.value > 0 ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : delta.value < 0 ? (
              <ArrowDownRight className="size-3.5" aria-hidden />
            ) : null}
            {delta.value > 0 ? "+" : ""}
            {delta.value}
          </span>
          {delta.label}
        </p>
      ) : (
        hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      )}
    </Card>
  );
}
