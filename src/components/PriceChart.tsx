"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { EnrichedBar } from "@/lib/idx/indicators";
import { formatDateShort, formatCompact, formatRupiah } from "@/lib/format";

export function PriceChart({ bars }: { bars: EnrichedBar[] }) {
  const data = bars.map((b) => ({
    date: b.date,
    close: b.close,
    volume: b.volume,
    up: b.close >= b.prevClose,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          minTickGap={24}
        />
        <YAxis
          yAxisId="price"
          domain={["auto", "auto"]}
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          tickFormatter={(v) => formatCompact(v)}
          width={56}
        />
        <YAxis
          yAxisId="volume"
          orientation="right"
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          tickFormatter={(v) => formatCompact(v)}
          width={48}
        />
        <Tooltip
          labelFormatter={(v) => formatDateShort(String(v))}
          formatter={(value, name) => [
            name === "close" ? formatRupiah(Number(value)) : formatCompact(Number(value)),
            name === "close" ? "Close" : "Volume",
          ]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar yAxisId="volume" dataKey="volume" fill="var(--chart-volume)" opacity={0.5} />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="close"
          stroke="var(--chart-price)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
