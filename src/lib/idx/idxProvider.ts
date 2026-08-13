import type { DailyBar, IdxProvider, StockHistory } from "./types";
import { IdxUnavailableError } from "./types";
import { findTicker } from "./tickers";

/**
 * Unofficial IDX data source.
 *
 * idx.co.id does not publish a documented, versioned public API. This talks
 * to the JSON endpoint the idx.co.id website itself uses to render its daily
 * "Ringkasan Perdagangan" (trading summary) table, which happens to include
 * daily foreign buy/sell volume per stock. It can change or disappear
 * without notice, so every step here is defensive: unexpected response
 * shapes are treated as failure (never silently wrong data) and the caller
 * (see provider.ts) falls back to mock data rather than crashing the page.
 *
 * IMPORTANT: this file could not be tested against the live endpoint from
 * the environment that authored it (outbound access to idx.co.id was
 * blocked there). Verify against real responses before relying on it, and
 * adjust FIELD_ALIASES below if idx.co.id's JSON keys differ.
 */

const BASE_URL = "https://www.idx.co.id/primary/TradingSummary/GetStockSummary";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_REQUESTS = 4;

// Each entry: canonical field -> possible JSON key names (case-insensitive).
const FIELD_ALIASES: Record<string, string[]> = {
  code: ["StockCode", "Code", "stock_code"],
  name: ["StockName", "Name", "stock_name"],
  prevClose: ["Previous", "PreviousPrice", "prev_close"],
  open: ["OpenPrice", "Open", "FirstTrade"],
  high: ["High", "HighPrice"],
  low: ["Low", "LowPrice"],
  close: ["Close", "ClosePrice"],
  change: ["Change"],
  volume: ["Volume", "TradingVolume"],
  value: ["Value", "TradingValue"],
  frequency: ["Frequency", "TradingFrequency"],
  foreignBuy: ["ForeignBuy", "ForeignBuyVolume"],
  foreignSell: ["ForeignSell", "ForeignSellVolume"],
};

type RawRow = Record<string, unknown>;

function normalizedKeyMap(row: RawRow): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(k.toLowerCase(), v);
  }
  return map;
}

function pickField(
  normalized: Map<string, unknown>,
  aliases: string[]
): unknown {
  for (const alias of aliases) {
    const v = normalized.get(alias.toLowerCase());
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function businessDatesGoingBack(fromToday: number): Date[] {
  const dates: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (dates.length < fromToday && guard < fromToday * 4 + 30) {
    guard++;
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

interface DailySnapshot {
  rows: Map<string, DailyBar & { name: string }>;
}

// Past trading days never change, so cache them for the life of the server
// process; today's snapshot is cached briefly since it updates intraday.
const snapshotCache = new Map<string, { snapshot: DailySnapshot; expiresAt: number }>();

async function fetchDailySnapshot(date: Date): Promise<DailySnapshot> {
  const key = toIsoDate(date);
  const cached = snapshotCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  const url = `${BASE_URL}?length=9999&start=0&date=${formatDateParam(date)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let json: unknown;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham",
      },
      // Past trading days are immutable; let the platform cache them.
      next: { revalidate: isToday(date) ? 300 : 60 * 60 * 24 * 30 },
    });
    if (!res.ok) {
      throw new IdxUnavailableError(`IDX HTTP ${res.status} for ${key}`);
    }
    json = await res.json();
  } catch (err) {
    if (err instanceof IdxUnavailableError) throw err;
    throw new IdxUnavailableError(`IDX fetch failed for ${key}`, err);
  } finally {
    clearTimeout(timeout);
  }

  const list: RawRow[] = Array.isArray(json)
    ? (json as RawRow[])
    : Array.isArray((json as { data?: unknown })?.data)
      ? ((json as { data: RawRow[] }).data)
      : [];

  const rows = new Map<string, DailyBar & { name: string }>();
  for (const raw of list) {
    const normalized = normalizedKeyMap(raw);
    const code = toStr(pickField(normalized, FIELD_ALIASES.code)).toUpperCase();
    if (!code) continue;
    rows.set(code, {
      name: toStr(pickField(normalized, FIELD_ALIASES.name)),
      date: key,
      prevClose: toNumber(pickField(normalized, FIELD_ALIASES.prevClose)),
      open: toNumber(pickField(normalized, FIELD_ALIASES.open)),
      high: toNumber(pickField(normalized, FIELD_ALIASES.high)),
      low: toNumber(pickField(normalized, FIELD_ALIASES.low)),
      close: toNumber(pickField(normalized, FIELD_ALIASES.close)),
      change: toNumber(pickField(normalized, FIELD_ALIASES.change)),
      volume: toNumber(pickField(normalized, FIELD_ALIASES.volume)),
      value: toNumber(pickField(normalized, FIELD_ALIASES.value)),
      frequency: toNumber(pickField(normalized, FIELD_ALIASES.frequency)),
      foreignBuy: toNumber(pickField(normalized, FIELD_ALIASES.foreignBuy)),
      foreignSell: toNumber(pickField(normalized, FIELD_ALIASES.foreignSell)),
    });
  }

  const snapshot: DailySnapshot = { rows };
  snapshotCache.set(key, {
    snapshot,
    expiresAt: Date.now() + (isToday(date) ? 5 * 60_000 : 30 * 24 * 60 * 60_000),
  });
  return snapshot;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { status: "fulfilled", value: await fn(items[idx]) };
      } catch (err) {
        results[idx] = { status: "rejected", reason: err };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

export const idxProvider: IdxProvider = {
  async getHistory(code: string, tradingDays: number): Promise<StockHistory> {
    const normalizedCode = code.toUpperCase();
    const dates = businessDatesGoingBack(tradingDays);

    const settled = await mapWithConcurrency(
      dates,
      MAX_CONCURRENT_REQUESTS,
      fetchDailySnapshot
    );

    const anyFulfilled = settled.some((s) => s.status === "fulfilled");
    if (!anyFulfilled) {
      const firstError = settled.find((s) => s.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      throw new IdxUnavailableError(
        "IDX unreachable or returned no usable data",
        firstError?.reason
      );
    }

    const bars: DailyBar[] = [];
    let name = findTicker(normalizedCode)?.name ?? "";
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const row = result.value.rows.get(normalizedCode);
      if (!row) continue;
      if (row.name) name = row.name;
      const { date, prevClose, open, high, low, close, change, volume, value, frequency, foreignBuy, foreignSell } = row;
      bars.push({ date, prevClose, open, high, low, close, change, volume, value, frequency, foreignBuy, foreignSell });
    }

    if (bars.length === 0) {
      throw new IdxUnavailableError(
        `No trading data found for ${normalizedCode} in the requested range`
      );
    }

    bars.sort((a, b) => a.date.localeCompare(b.date));

    return {
      code: normalizedCode,
      name: name || normalizedCode,
      bars,
      source: "idx",
      asOf: new Date().toISOString(),
    };
  },
};
