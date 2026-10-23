"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SEVERITY_META } from "@/lib/constants";
import { AXIS, TooltipCard } from "./chart-tooltip";

type Severity = keyof typeof SEVERITY_META;

/** Open issues by severity — status colours, always labelled. */
export function SeverityChart({ data }: { data: Array<{ severity: Severity; count: number }> }) {
  const rows = data.map((d) => ({ ...d, label: SEVERITY_META[d.severity].label }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: -18 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard
                  rows={[
                    {
                      name: `${payload[0].payload.label} severity`,
                      value: payload[0].payload.count,
                      color: SEVERITY_META[payload[0].payload.severity as Severity].color,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.severity} fill={SEVERITY_META[r.severity].color} />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "var(--chart-ink)", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
