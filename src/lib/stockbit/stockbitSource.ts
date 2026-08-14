import { StockbitAuthError, StockbitUnavailableError } from "./types";
import type { BrokerDistribution, BrokerRow } from "./types";

/**
 * Unofficial Stockbit data source.
 *
 * Stockbit has no public/documented API. This calls the same
 * `exodus.stockbit.com` JSON endpoint their own web/mobile app uses for the
 * "Ringkasan Broker" (broker distribution) view — per-stock, top-5
 * buyer/seller brokers for a given period. Endpoint and response shape are
 * reconstructed from open-source community projects (not from Stockbit
 * documentation, which doesn't exist), so parsing here is defensive:
 * several possible key names are tried, and anything unexpected fails
 * loudly rather than silently returning wrong numbers.
 *
 * Auth is intentionally NOT automated: Stockbit's login is behind
 * reCAPTCHA, and scripting around that would mean deliberately defeating
 * an anti-bot control, which this project won't do. Instead, the caller
 * supplies a Bearer token the user copies from their own logged-in
 * browser session (see README). That token expires periodically and must
 * be refreshed manually — `StockbitAuthError` signals exactly that case
 * so callers can surface a clear "token expired" status instead of
 * silently losing data.
 */

const BASE_URL = "https://exodus.stockbit.com/order-trade/broker/distribution";
const REQUEST_TIMEOUT_MS = 15_000;
const TOP_N = 5;

export type StockbitPeriod =
  | "TB_PERIOD_LAST_1_DAY"
  | "TB_PERIOD_LAST_7_DAY"
  | "TB_PERIOD_LAST_1_MONTH"
  | "TB_PERIOD_LAST_3_MONTH"
  | "TB_PERIOD_LAST_6_MONTH"
  | "TB_PERIOD_LAST_1_YEAR";

function parseAbbreviatedNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const s = v.trim().replace(/^Rp/i, "").replace(/,/g, "").trim();
  if (!s) return 0;
  const match = s.match(/^(-?[\d.]+)\s*([KMBT])?$/i);
  if (!match) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;
  const suffix = (match[2] || "").toUpperCase();
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[suffix] ?? 1;
  return num * mult;
}

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj {
  return v && typeof v === "object" ? (v as Obj) : {};
}

function firstPresent(obj: Obj, keys: string[]): unknown {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function extractBrokerCode(entry: Obj): string {
  const detail = asObj(entry.detail);
  const broker = asObj(entry.broker);
  const buyer = asObj(entry.buyer);
  const seller = asObj(entry.seller);
  const code =
    firstPresent(detail, ["code", "broker_code"]) ??
    firstPresent(broker, ["code"]) ??
    firstPresent(buyer, ["code"]) ??
    firstPresent(seller, ["code"]) ??
    firstPresent(entry, [
      "code",
      "broker_code",
      "buyer_code",
      "seller_code",
      "brokerCode",
    ]);
  return code ? String(code).toUpperCase() : "";
}

function extractBrokerName(entry: Obj): string {
  const detail = asObj(entry.detail);
  const broker = asObj(entry.broker);
  const buyer = asObj(entry.buyer);
  const seller = asObj(entry.seller);
  const name =
    firstPresent(detail, ["name", "broker_name"]) ??
    firstPresent(broker, ["name"]) ??
    firstPresent(buyer, ["name"]) ??
    firstPresent(seller, ["name"]) ??
    firstPresent(entry, ["name", "broker_name", "buyer_name", "seller_name"]);
  return name ? String(name) : "";
}

function extractField(entry: Obj, keys: string[]): number {
  const detail = asObj(entry.detail);
  const raw = firstPresent(detail, keys) ?? firstPresent(entry, keys);
  return parseAbbreviatedNumber(raw);
}

function extractBrokerRows(entries: unknown): BrokerRow[] {
  if (!Array.isArray(entries)) return [];
  const rows: BrokerRow[] = [];
  for (const raw of entries.slice(0, TOP_N)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Obj;
    const brokerCode = extractBrokerCode(entry);
    if (!brokerCode) continue;
    rows.push({
      rank: rows.length + 1,
      brokerCode,
      brokerName: extractBrokerName(entry),
      value: extractField(entry, ["amount", "value", "total_value", "totalValue"]),
      lot: extractField(entry, ["lot", "lots", "volume", "total_lot", "total_volume"]),
      avgPrice: extractField(entry, ["avg", "avg_price", "average", "price_avg"]),
    });
  }
  return rows;
}

function extractDistributionSection(data: Obj): Obj {
  const byValue = asObj(data.by_value);
  if (Object.keys(byValue).length > 0) return byValue;
  const byLot = asObj(data.by_lot);
  if (Object.keys(byLot).length > 0) return byLot;
  return data;
}

function buildUrl(code: string, period: StockbitPeriod): string {
  const params = new URLSearchParams({
    date: "",
    symbol: code,
    investor_type: "INVESTOR_TYPE_ALL",
    market_board: "MARKET_TYPE_REGULER",
    data_type: "BROKER_DISTRIBUTION_DATA_TYPE_VALUE",
    period,
  });
  return `${BASE_URL}?${params.toString()}`;
}

/** Fetches top-5 buyer/seller broker distribution for one stock from Stockbit. */
export async function fetchBrokerDistribution(
  code: string,
  token: string,
  period: StockbitPeriod = "TB_PERIOD_LAST_1_DAY"
): Promise<BrokerDistribution> {
  const url = buildUrl(code, period);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let json: unknown;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0",
      },
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      throw new StockbitAuthError(
        `Stockbit token rejected (HTTP ${res.status}) — token likely expired, get a new one`
      );
    }
    if (!res.ok) {
      throw new StockbitUnavailableError(`Stockbit HTTP ${res.status} for ${code}`);
    }
    json = await res.json();
  } catch (err) {
    if (err instanceof StockbitAuthError || err instanceof StockbitUnavailableError) throw err;
    throw new StockbitUnavailableError(`Stockbit fetch failed for ${code}`, err);
  } finally {
    clearTimeout(timeout);
  }

  const resp = asObj(json);
  const data = Object.keys(asObj(resp.data)).length > 0 ? asObj(resp.data) : resp;
  const section = extractDistributionSection(data);

  const buyList =
    section.top_broker_buy ?? section.buy ?? section.broker_buy ?? section.top_buy ?? [];
  const sellList =
    section.top_broker_sell ?? section.sell ?? section.broker_sell ?? section.top_sell ?? [];

  const buy = extractBrokerRows(buyList);
  const sell = extractBrokerRows(sellList);

  if (buy.length === 0 && sell.length === 0) {
    throw new StockbitUnavailableError(
      `No broker distribution data found for ${code} (unexpected response shape or no trades)`
    );
  }

  return { code: code.toUpperCase(), buy, sell };
}
