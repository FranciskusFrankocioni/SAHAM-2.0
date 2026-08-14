import Link from "next/link";
import { notFound } from "next/navigation";
import { getStockHistory, getBrokerSummary } from "@/lib/idx/provider";
import { analyzeStock } from "@/lib/idx/indicators";
import { formatCompact, formatDateShort } from "@/lib/format";
import { SearchBar } from "@/components/SearchBar";
import { SummaryCards } from "@/components/SummaryCards";
import { PriceChart } from "@/components/PriceChart";
import { ForeignFlowChart } from "@/components/ForeignFlowChart";
import { AccumulationChart } from "@/components/AccumulationChart";
import { BrokerSummaryTable } from "@/components/BrokerSummaryTable";
import { Disclaimer } from "@/components/Disclaimer";
import { DataSourceBanner } from "@/components/DataSourceBanner";

const CODE_PATTERN = /^[A-Za-z0-9]{2,5}$/;
const RANGE_OPTIONS = [20, 30, 60, 90];

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { code: rawCode } = await params;
  const { days: daysParam } = await searchParams;
  const code = rawCode.toUpperCase();

  if (!CODE_PATTERN.test(code)) {
    notFound();
  }

  const tradingDays = RANGE_OPTIONS.includes(Number(daysParam))
    ? Number(daysParam)
    : 30;

  const [history, brokerSummary] = await Promise.all([
    getStockHistory(code, tradingDays),
    getBrokerSummary(code),
  ]);
  const analysis = analyzeStock(history.bars);

  const lastBar = history.bars[history.bars.length - 1];
  const changePct = lastBar
    ? ((lastBar.close - lastBar.prevClose) / lastBar.prevClose) * 100
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          &larr; Cari saham lain
        </Link>
        <SearchBar />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {history.code}
          <span className="ml-2 text-base font-normal text-zinc-500">
            {history.name}
          </span>
        </h1>
        <p className="text-xs text-zinc-500">
          Data {history.source === "idx" ? "IDX (harian)" : "contoh (dummy)"} &middot;
          {" "}diperbarui {formatDateShort(history.asOf)}
        </p>
      </div>

      {history.warning && <DataSourceBanner warning={history.warning} />}

      <SummaryCards analysis={analysis} lastClose={lastBar?.close ?? 0} changePct={changePct} />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Rentang:</span>
        {RANGE_OPTIONS.map((d) => (
          <Link
            key={d}
            href={`/saham/${code}?days=${d}`}
            className={`rounded-md px-2.5 py-1 ${
              d === tradingDays
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
            }`}
          >
            {d}H
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Harga &amp; Volume
        </h2>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <PriceChart bars={analysis.bars} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Akumulasi Asing (Foreign Flow)
        </h2>
        <p className="text-xs text-zinc-500">
          Batang: net beli/jual asing harian (lembar). Garis: kumulatif net asing sepanjang periode.
        </p>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <ForeignFlowChart bars={analysis.bars} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Indikator Akumulasi / Distribusi (proxy &ldquo;bandar&rdquo;)
        </h2>
        <p className="text-xs text-zinc-500">
          Chaikin Accumulation/Distribution Line &mdash; naik berarti tekanan beli
          mendominasi, turun berarti tekanan jual mendominasi.{" "}
          {analysis.adLineChange !== null && (
            <span className={analysis.adLineChange >= 0 ? "text-emerald-500" : "text-rose-500"}>
              {analysis.adLineChange >= 0 ? "Naik" : "Turun"} {formatCompact(Math.abs(analysis.adLineChange))} pada periode ini
            </span>
          )}
        </p>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <AccumulationChart bars={analysis.bars} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Ringkasan Broker
        </h2>
        <p className="text-xs text-zinc-500">
          Top 5 broker pembeli &amp; penjual harian &mdash; data asli dari Stockbit, bukan
          estimasi.
        </p>
        <BrokerSummaryTable summary={brokerSummary} />
      </section>

      <Disclaimer />
    </div>
  );
}
