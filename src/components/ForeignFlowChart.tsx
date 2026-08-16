"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { EnrichedBar } from "@/lib/idx/indicators";
import { formatDateShort, formatCompact } from "@/lib/format";

export function ForeignFlowChart({ bars }: { bars: EnrichedBar[] }) {
  const data = bars.map((b) => ({
    date: b.date,
    foreignNet: b.foreignNet,
    foreignNetCumulative: b.foreignNetCumulative,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          minTickGap={24}
        />
        <YAxis
          yAxisId="net"
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          tickFormatter={(v) => formatCompact(v)}
          width={56}
        />
        <YAxis
          yAxisId="cum"
          orientation="right"
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          tickFormatter={(v) => formatCompact(v)}
          width={56}
        />
        <ReferenceLine yAxisId="net" y={0} stroke="var(--chart-axis)" />
        <Tooltip
          labelFormatter={(v) => formatDateShort(String(v))}
          formatter={(value, name) => [
            formatCompact(Number(value)),
            name === "foreignNet" ? "Net asing (Rp)" : "Kumulatif asing (Rp)",
          ]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar yAxisId="net" dataKey="foreignNet">
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.foreignNet >= 0 ? "var(--chart-positive)" : "var(--chart-negative)"}
            />
          ))}
        </Bar>
        <Line
          yAxisId="cum"
          type="monotone"
          dataKey="foreignNetCumulative"
          stroke="var(--chart-accent)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
