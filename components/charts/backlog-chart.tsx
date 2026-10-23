"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORICAL } from "@/lib/constants";
import { AXIS, Legend, TooltipCard } from "./chart-tooltip";

const SERIES = [
  { key: "openReports", label: "Open backlog", color: CATEGORICAL[0] },
  { key: "criticalOpen", label: "Critical open", color: CATEGORICAL[1] },
] as const;

/** Daily open backlog from AnalyticsSummary snapshots. */
export function BacklogChart({
  data,
}: {
  data: Array<{ date: string; openReports: number; criticalOpen: number }>;
}) {
  if (data.length === 0)
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Snapshots appear after the daily job runs.
      </p>
    );
  return (
    <div>
      <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="date"
              {...AXIS}
              tickFormatter={(d: string) => format(parseISO(d), "d MMM")}
              minTickGap={28}
            />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={format(parseISO(String(label)), "EEE d MMM")}
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
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
