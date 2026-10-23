"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORICAL } from "@/lib/constants";
import { AXIS, Legend, TooltipCard } from "./chart-tooltip";

const SERIES = [
  { key: "open", label: "Unresolved", color: CATEGORICAL[0] },
  { key: "resolved", label: "Resolved", color: CATEGORICAL[1] },
] as const;

/** Resolved vs unresolved per neighbourhood (horizontal stacked bars, 2px surface gap between segments). */
export function ResolvedStackedBars({
  data,
}: {
  data: Array<{ name: string; open: number; resolved: number }>;
}) {
  const height = Math.max(200, data.length * 30 + 40);
  return (
    <div>
      <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 4 }}
            barCategoryGap="28%"
          >
            <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
            <XAxis type="number" {...AXIS} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              {...AXIS}
              axisLine={false}
              width={112}
              tick={{ fill: "var(--chart-ink)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={String(label)}
                    rows={SERIES.map((s) => ({
                      name: s.label,
                      color: s.color,
                      value: Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0),
                    }))}
                  />
                ) : null
              }
            />
            <Bar
              dataKey="open"
              stackId="a"
              fill={SERIES[0].color}
              maxBarSize={20}
              stroke="var(--chart-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Bar
              dataKey="resolved"
              stackId="a"
              fill={SERIES[1].color}
              maxBarSize={20}
              radius={[0, 4, 4, 0]}
              stroke="var(--chart-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
