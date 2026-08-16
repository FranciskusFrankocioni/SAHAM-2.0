export interface DailyBar {
  date: string; // YYYY-MM-DD
  prevClose: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  volume: number;
  value: number;
  frequency: number;
  foreignBuy: number;
  foreignSell: number;
}

export type DataSource = "idx" | "mock";

export interface StockHistory {
  code: string;
  name: string;
  bars: DailyBar[];
  source: DataSource;
  warning?: string;
  /** When this data was fetched/generated (timestamp, not a trading date). */
  asOf: string;
  /** YYYY-MM-DD of the last closed trading day actually shown — see src/lib/tradingCalendar.ts. */
  tradingDate: string;
}

export interface IdxProvider {
  getHistory(code: string, tradingDays: number): Promise<StockHistory>;
}

export class IdxUnavailableError extends Error {
  constructor(message: string, readonly cause_?: unknown) {
    super(message);
    this.name = "IdxUnavailableError";
  }
}
