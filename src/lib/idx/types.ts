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
  asOf: string;
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
