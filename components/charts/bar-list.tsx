import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Optional secondary value shown as an inner segment (e.g. open out of total). */
  secondary?: number;
  href?: string;
  icon?: React.ReactNode;
}

/**
 * Accessible horizontal bar list (single series): labels and values are real text, so nothing is
 * clipped and screen readers get the numbers directly.
 */
export function BarList({
  items,
  color = "#2a78d6",
  valueLabel,
  secondaryLabel,
  className,
}: {
  items: BarListItem[];
  color?: string;
  valueLabel?: string;
  secondaryLabel?: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              <span className="tabular text-muted-foreground shrink-0">
                {item.secondary != null && (
                  <>
                    <span className="text-foreground font-semibold">{item.secondary}</span>
                    {secondaryLabel ? ` ${secondaryLabel} · ` : " / "}
                  </>
                )}
                <span className={cn(item.secondary == null && "text-foreground font-semibold")}>
                  {item.value}
                </span>
                {valueLabel ? ` ${valueLabel}` : ""}
              </span>
            </div>
            <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full" aria-hidden>
              <div
                className="relative h-full rounded-full"
                style={{ width: `${(item.value / max) * 100}%`, backgroundColor: `${color}55` }}
              >
                {item.secondary != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${(item.secondary / Math.max(1, item.value)) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                )}
              </div>
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="hover:bg-muted/70 -mx-2 block rounded-lg px-2 py-1">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
