import { formatCompact, formatPercent, formatRupiah } from "@/lib/format";
import { SignalBadge } from "./SignalBadge";
import type { StockAnalysis } from "@/lib/idx/indicators";

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function SummaryCards({
  analysis,
  lastClose,
  changePct,
}: {
  analysis: StockAnalysis;
  lastClose: number;
  changePct: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card
        label="Harga Terakhir"
        value={formatRupiah(lastClose)}
        sub={formatPercent(changePct)}
      />
      <Card label="Sinyal Teknikal" value={<SignalBadge signal={analysis.overallSignal} />} />
      <Card
        label="Net Asing (periode)"
        value={formatCompact(analysis.foreignNetTotal)}
        sub={analysis.foreignNetTotal >= 0 ? "Net beli asing" : "Net jual asing"}
      />
      <Card
        label="Hari Retail Distribusi"
        value={analysis.distribusiRetailDays}
        sub="Harga naik, volume tinggi, asing jual"
      />
    </div>
  );
}
