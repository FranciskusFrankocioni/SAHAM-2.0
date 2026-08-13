import { idxProvider } from "./idxProvider";
import { mockProvider } from "./mockProvider";
import { IdxUnavailableError, type StockHistory } from "./types";

const FORCE_MOCK = process.env.SAHAM_DATA_SOURCE === "mock";

export async function getStockHistory(
  code: string,
  tradingDays: number
): Promise<StockHistory> {
  if (FORCE_MOCK) {
    return mockProvider.getHistory(code, tradingDays);
  }

  try {
    return await idxProvider.getHistory(code, tradingDays);
  } catch (err) {
    const reason =
      err instanceof IdxUnavailableError ? err.message : "Kesalahan tidak diketahui";
    const fallback = await mockProvider.getHistory(code, tradingDays);
    return {
      ...fallback,
      warning: `Data langsung dari IDX tidak tersedia saat ini (${reason}). Menampilkan data contoh (dummy) sebagai gantinya.`,
    };
  }
}
