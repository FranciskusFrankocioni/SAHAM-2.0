import type { DailySignal } from "@/lib/idx/indicators";

const STYLES: Record<DailySignal, string> = {
  akumulasi: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  distribusi: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
  netral: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
};

const LABELS: Record<DailySignal, string> = {
  akumulasi: "Akumulasi",
  distribusi: "Distribusi",
  netral: "Netral",
};

export function SignalBadge({ signal }: { signal: DailySignal }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${STYLES[signal]}`}
    >
      {LABELS[signal]}
    </span>
  );
}
