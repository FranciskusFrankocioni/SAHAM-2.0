"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { EnrichedBar } from "@/lib/idx/indicators";
import { formatDateShort, formatCompact } from "@/lib/format";

export function AccumulationChart({ bars }: { bars: EnrichedBar[] }) {
  const data = bars.map((b) => ({ date: b.date, adLine: b.adLine }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="adFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          tickFormatter={(v) => formatCompact(v)}
          width={56}
        />
        <ReferenceLine y={0} stroke="var(--chart-axis)" />
        <Tooltip
          labelFormatter={(v) => formatDateShort(String(v))}
          formatter={(value) => [formatCompact(Number(value)), "A/D Line"]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="adLine"
          stroke="var(--chart-accent)"
          fill="url(#adFill)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
