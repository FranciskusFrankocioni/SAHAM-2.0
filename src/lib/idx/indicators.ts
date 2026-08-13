import type { DailyBar } from "./types";

export type DailySignal = "akumulasi" | "distribusi" | "netral";

export interface EnrichedBar extends DailyBar {
  foreignNet: number;
  foreignNetCumulative: number;
  adLine: number; // Chaikin Accumulation/Distribution line (cumulative)
  relativeVolume: number | null; // volume vs 20-bar average, null until enough history
  signal: DailySignal;
}

export interface StockAnalysis {
  bars: EnrichedBar[];
  overallSignal: DailySignal;
  foreignNetTotal: number;
  adLineChange: number | null;
  distribusiRetailDays: number; // heuristic count: high volume, price up, but foreign+smart money selling
}

const VOLUME_LOOKBACK = 20;

/**
 * Enriches raw OHLCV + foreign-flow bars with derived indicators.
 *
 * Important limitation: IDX does not publish free, per-broker trade data,
 * so there is no real "which broker/bandar bought how much" signal
 * available here. `adLine` (Chaikin Accumulation/Distribution) and the
 * resulting akumulasi/distribusi/netral `signal` are standard price/volume
 * based technical heuristics, not literal broker positions. `foreignNet`
 * IS real: it comes directly from IDX's published daily foreign buy/sell
 * volume per stock.
 */
export function analyzeStock(bars: DailyBar[]): StockAnalysis {
  let foreignCumulative = 0;
  let adCumulative = 0;
  const enriched: EnrichedBar[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const foreignNet = bar.foreignBuy - bar.foreignSell;
    foreignCumulative += foreignNet;

    const range = bar.high - bar.low;
    const moneyFlowMultiplier =
      range === 0 ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    const moneyFlowVolume = moneyFlowMultiplier * bar.volume;
    adCumulative += moneyFlowVolume;

    let relativeVolume: number | null = null;
    if (i >= VOLUME_LOOKBACK) {
      const window = bars.slice(i - VOLUME_LOOKBACK, i);
      const avgVolume =
        window.reduce((sum, b) => sum + b.volume, 0) / window.length;
      relativeVolume = avgVolume > 0 ? bar.volume / avgVolume : null;
    }

    const priceUp = bar.close > bar.prevClose;
    const priceDown = bar.close < bar.prevClose;
    const highVolume = (relativeVolume ?? 1) >= 1.3;

    let signal: DailySignal = "netral";
    if (highVolume && priceUp && foreignNet >= 0 && moneyFlowMultiplier > 0.1) {
      signal = "akumulasi";
    } else if (
      highVolume &&
      (priceDown || moneyFlowMultiplier < -0.1) &&
      foreignNet <= 0
    ) {
      signal = "distribusi";
    }

    enriched.push({
      ...bar,
      foreignNet,
      foreignNetCumulative: foreignCumulative,
      adLine: adCumulative,
      relativeVolume,
      signal,
    });
  }

  const recentWindow = enriched.slice(-10);
  const akumulasiCount = recentWindow.filter((b) => b.signal === "akumulasi").length;
  const distribusiCount = recentWindow.filter((b) => b.signal === "distribusi").length;
  const overallSignal: DailySignal =
    akumulasiCount > distribusiCount
      ? "akumulasi"
      : distribusiCount > akumulasiCount
        ? "distribusi"
        : "netral";

  // Retail distribution heuristic: price still rising (retail chasing) on
  // above-average volume, while the money-flow line and foreign flow both
  // point the other way (net sellers ahead of the crowd).
  const distribusiRetailDays = enriched.filter((b, i) => {
    if (i === 0) return false;
    const prev = enriched[i - 1];
    const priceUp = b.close > b.prevClose;
    return (
      priceUp &&
      (b.relativeVolume ?? 1) >= 1.3 &&
      b.foreignNet < 0 &&
      b.adLine < prev.adLine
    );
  }).length;

  const first = enriched[0];
  const last = enriched[enriched.length - 1];
  const adLineChange = first && last ? last.adLine - first.adLine : null;

  return {
    bars: enriched,
    overallSignal,
    foreignNetTotal: foreignCumulative,
    adLineChange,
    distribusiRetailDays,
  };
}
