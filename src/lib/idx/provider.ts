import { mockProvider } from "./mockProvider";
import type { StockHistory } from "./types";
import { isDbConfigured } from "../db/client";
import { getBarsForCode } from "../db/store";

const FORCE_MOCK = process.env.SAHAM_DATA_SOURCE === "mock";

/**
 * Serves stock history to pages/API routes. Data is never fetched live from
 * IDX here — it comes from Postgres, populated once a day (after market
 * close) by the ingestion routes in `src/app/api/cron/*`. This keeps page
 * loads fast and independent of IDX's availability, and matches the
 * intended use case: end-of-day data to decide on before the next session
 * opens, not intraday quotes.
 *
 * Falls back to deterministic mock data (with a warning banner) when no DB
 * is configured yet, or when the requested code has no stored history —
 * e.g. right after deploying and before the first cron run.
 */
export async function getStockHistory(
  code: string,
  tradingDays: number
): Promise<StockHistory> {
  const normalizedCode = code.toUpperCase();

  if (!FORCE_MOCK && isDbConfigured()) {
    try {
      const stored = await getBarsForCode(normalizedCode, tradingDays);
      if (stored && stored.bars.length > 0) {
        return {
          code: normalizedCode,
          name: stored.name,
          bars: stored.bars,
          source: "idx",
          asOf: stored.lastFetchedAt,
        };
      }
    } catch (err) {
      const fallback = await mockProvider.getHistory(normalizedCode, tradingDays);
      return {
        ...fallback,
        warning: `Gagal membaca data dari database (${
          err instanceof Error ? err.message : "kesalahan tidak diketahui"
        }). Menampilkan data contoh (dummy) sebagai gantinya.`,
      };
    }
  }

  const fallback = await mockProvider.getHistory(normalizedCode, tradingDays);
  return {
    ...fallback,
    warning: FORCE_MOCK
      ? undefined
      : !isDbConfigured()
        ? "Database belum terhubung. Menampilkan data contoh (dummy) — hubungkan Postgres dan jalankan ingestion harian untuk data asli."
        : `Belum ada data tersimpan untuk ${normalizedCode}. Menampilkan data contoh (dummy) sampai ingestion harian berjalan untuk kode ini.`,
  };
}
