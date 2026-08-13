import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { IngestionStatus } from "@/components/IngestionStatus";
import { TICKERS } from "@/lib/idx/tickers";

const POPULAR_CODES = ["BBCA", "BBRI", "TLKM", "ASII", "GOTO", "ANTM", "ADRO", "BMRI"];

export default function Home() {
  const popular = POPULAR_CODES.map((code) => TICKERS.find((t) => t.code === code)).filter(
    (t): t is (typeof TICKERS)[number] => Boolean(t)
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Radar Saham IDX
        </h1>
        <p className="text-sm text-zinc-500 sm:text-base">
          Pantau pergerakan harga, akumulasi asing, dan indikator
          akumulasi/distribusi untuk saham-saham di Bursa Efek Indonesia.
        </p>
      </div>

      <SearchBar autoFocus />

      <div className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Populer
        </span>
        <div className="flex flex-wrap justify-center gap-2">
          {popular.map((t) => (
            <Link
              key={t.code}
              href={`/saham/${t.code}`}
              className="rounded-full border border-black/10 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              {t.code}
            </Link>
          ))}
        </div>
      </div>

      <IngestionStatus />
    </div>
  );
}
