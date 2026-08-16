import type { DailyBar, IdxProvider, StockHistory } from "./types";
import { findTicker } from "./tickers";
import { getTradingDateCeiling } from "../tradingCalendar";

// Deterministic pseudo-random number generator seeded by a string, so the
// same stock code always produces the same mock chart (stable across
// requests/reloads) without needing any persisted state.
function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// Mock data mirrors the real provider's "closed trading day only" rule so
// the UI looks/behaves the same in mock mode as it does with real data.
function lastTradingDays(count: number): string[] {
  const ceiling = getTradingDateCeiling();
  const [y, m, d] = ceiling.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));

  const days: string[] = [];
  while (days.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.unshift(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(
          cursor.getUTCDate()
        ).padStart(2, "0")}`
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function buildMockBars(code: string, tradingDays: number): DailyBar[] {
  const rand = seededRandom(code);
  const dates = lastTradingDays(tradingDays);

  // Pick a base price loosely based on the code so different tickers look
  // visually distinct, then random-walk it with an underlying "regime"
  // (accumulation / distribution / neutral) that persists for a few days
  // at a time, so the mock data tells a plausible story.
  let price = 500 + Math.floor(rand() * 9500);
  let regime: "akumulasi" | "distribusi" | "netral" = "netral";
  let regimeDaysLeft = 0;

  const bars: DailyBar[] = [];
  for (const date of dates) {
    if (regimeDaysLeft <= 0) {
      const roll = rand();
      regime = roll < 0.35 ? "akumulasi" : roll < 0.65 ? "distribusi" : "netral";
      regimeDaysLeft = 4 + Math.floor(rand() * 6);
    }
    regimeDaysLeft--;

    const prevClose = price;
    const drift =
      regime === "akumulasi" ? 0.006 : regime === "distribusi" ? -0.006 : 0;
    const noise = (rand() - 0.5) * 0.02;
    const changePct = drift + noise;

    const open = prevClose * (1 + (rand() - 0.5) * 0.006);
    const close = Math.max(50, prevClose * (1 + changePct));
    const high = Math.max(open, close) * (1 + rand() * 0.008);
    const low = Math.min(open, close) * (1 - rand() * 0.008);

    const baseVolume = 5_000_000 + rand() * 20_000_000;
    const volumeSpike =
      regime !== "netral" && rand() < 0.3 ? 1.6 + rand() : 1;
    const volume = Math.round(baseVolume * volumeSpike);
    const value = Math.round(volume * close);
    const frequency = Math.round(500 + volume / 5000);

    const foreignBias =
      regime === "akumulasi" ? 0.62 : regime === "distribusi" ? 0.38 : 0.5;
    const foreignShare = 0.15 + rand() * 0.25; // fraction of volume that is foreign
    const foreignTotal = volume * foreignShare;
    const foreignBuy = Math.round(foreignTotal * foreignBias);
    const foreignSell = Math.round(foreignTotal * (1 - foreignBias));

    bars.push({
      date,
      prevClose: Math.round(prevClose),
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      change: Math.round(close - prevClose),
      volume,
      value,
      frequency,
      foreignBuy,
      foreignSell,
    });

    price = close;
  }

  return bars;
}

export const mockProvider: IdxProvider = {
  async getHistory(code: string, tradingDays: number): Promise<StockHistory> {
    const normalized = code.toUpperCase();
    const known = findTicker(normalized);
    const bars = buildMockBars(normalized, tradingDays);
    return {
      code: normalized,
      name: known?.name ?? `${normalized} (nama tidak diketahui)`,
      bars,
      source: "mock",
      asOf: new Date().toISOString(),
      tradingDate: bars[bars.length - 1].date,
    };
  },
};
