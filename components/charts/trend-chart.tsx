"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORICAL } from "@/lib/constants";
import { AXIS, Legend, TooltipCard } from "./chart-tooltip";

const SERIES = [
  { key: "created", label: "New issues", color: CATEGORICAL[0] },
  { key: "resolved", label: "Resolved", color: CATEGORICAL[1] },
] as const;

/** Weekly new vs resolved issues (two series on one count axis). */
export function TrendChart({ data }: { data: Array<{ week: string; created: number; resolved: number }> }) {
  return (
    <div>
      <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="week"
              {...AXIS}
              tickFormatter={(w: string) => format(parseISO(w), "d MMM")}
              minTickGap={24}
            />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={`Week of ${format(parseISO(String(label)), "d MMM yyyy")}`}
                    rows={SERIES.map((s) => ({
                      name: s.label,
                      color: s.color,
                      value: Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0),
                    }))}
                  />
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
