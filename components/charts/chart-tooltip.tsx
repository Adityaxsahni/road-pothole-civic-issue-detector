"use client";

export interface TooltipRow {
  name: string;
  value: number | string;
  color: string;
}

/** Shared tooltip card: series colour lives on the swatch, text stays in ink tokens. */
export function TooltipCard({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="bg-card rounded-lg border px-3 py-2 text-xs shadow-lg">
      {title && <div className="text-foreground mb-1 font-medium">{title}</div>}
      <ul className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.name} className="text-muted-foreground flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
            <span className="flex-1">{r.name}</span>
            <span className="tabular text-foreground font-semibold">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export const AXIS = {
  tick: { fill: "var(--chart-muted)", fontSize: 11 },
  axisLine: { stroke: "var(--chart-axis)" },
  tickLine: false as const,
};
