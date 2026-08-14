import { formatCompact, formatDateShort } from "@/lib/format";
import type { StoredBrokerSummary } from "@/lib/db/store";
import type { BrokerRow } from "@/lib/stockbit/types";

function Side({ title, rows, tone }: { title: string; rows: BrokerRow[]; tone: "buy" | "sell" }) {
  const color = tone === "buy" ? "text-emerald-500" : "text-rose-500";
  return (
    <div className="flex-1 overflow-x-auto">
      <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${color}`}>
        {title}
      </div>
      <table className="w-full min-w-[220px] text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="pb-1 font-medium">Broker</th>
            <th className="pb-1 font-medium text-right">Lot</th>
            <th className="pb-1 font-medium text-right">Value</th>
            <th className="pb-1 font-medium text-right">Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.brokerCode} className="border-t border-black/5 dark:border-white/10">
              <td className={`py-1.5 font-mono font-semibold ${color}`}>{r.brokerCode}</td>
              <td className="py-1.5 text-right text-zinc-700 dark:text-zinc-300">
                {formatCompact(r.lot)}
              </td>
              <td className="py-1.5 text-right text-zinc-700 dark:text-zinc-300">
                {formatCompact(r.value)}
              </td>
              <td className="py-1.5 text-right text-zinc-500">{formatCompact(r.avgPrice)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-center text-xs text-zinc-500">
                Tidak ada data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function BrokerSummaryTable({ summary }: { summary: StoredBrokerSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-white/5">
        Belum ada data broker summary untuk saham ini. Data ini hanya diisi lewat ingestion
        Stockbit untuk saham yang ada di watchlist.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 text-xs text-zinc-500">
        Data per {formatDateShort(summary.date)} &middot; sumber: Stockbit (akun pribadi)
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <Side title="Top Buyer" rows={summary.buy} tone="buy" />
        <Side title="Top Seller" rows={summary.sell} tone="sell" />
      </div>
    </div>
  );
}
