import { getPool } from "./client";
import { ensureSchema } from "./schema";
import type { DailyBar } from "../idx/types";
import type { SnapshotRow } from "../idx/idxSource";
import type { BrokerDistribution, BrokerRow } from "../stockbit/types";

const CHUNK_SIZE = 200;
const COLUMNS = [
  "code",
  "date",
  "name",
  "prev_close",
  "open",
  "high",
  "low",
  "close",
  "change",
  "volume",
  "value",
  "frequency",
  "foreign_buy",
  "foreign_sell",
] as const;

/** Bulk upsert one day's full-market snapshot. Returns rows written. */
export async function upsertDailyBars(rows: SnapshotRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureSchema();
  const pool = getPool();

  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const values: unknown[] = [];
    const tuples = chunk.map((r, idx) => {
      const base = idx * COLUMNS.length;
      values.push(
        r.code,
        r.date,
        r.name,
        r.prevClose,
        r.open,
        r.high,
        r.low,
        r.close,
        r.change,
        r.volume,
        r.value,
        r.frequency,
        r.foreignBuy,
        r.foreignSell
      );
      const placeholders = COLUMNS.map((_, c) => `$${base + c + 1}`).join(", ");
      return `(${placeholders})`;
    });

    const sql = `
      INSERT INTO daily_bars (${COLUMNS.join(", ")})
      VALUES ${tuples.join(", ")}
      ON CONFLICT (code, date) DO UPDATE SET
        name = EXCLUDED.name,
        prev_close = EXCLUDED.prev_close,
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        change = EXCLUDED.change,
        volume = EXCLUDED.volume,
        value = EXCLUDED.value,
        frequency = EXCLUDED.frequency,
        foreign_buy = EXCLUDED.foreign_buy,
        foreign_sell = EXCLUDED.foreign_sell,
        fetched_at = now()
    `;
    await pool.query(sql, values);
    written += chunk.length;
  }
  return written;
}

export async function logIngestion(
  runDate: string,
  rowsUpserted: number,
  status: "ok" | "empty" | "error",
  detail?: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO ingestion_log (run_date, rows_upserted, status, detail) VALUES ($1, $2, $3, $4)`,
    [runDate, rowsUpserted, status, detail ?? null]
  );
}

export interface StoredHistory {
  name: string;
  bars: DailyBar[];
  lastFetchedAt: string;
}

export async function getBarsForCode(
  code: string,
  tradingDays: number
): Promise<StoredHistory | null> {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM daily_bars WHERE code = $1 ORDER BY date DESC LIMIT $2`,
    [code, tradingDays]
  );
  if (result.rows.length === 0) return null;

  const bars: DailyBar[] = result.rows
    .map((row) => ({
      date: String(row.date),
      prevClose: Number(row.prev_close),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      change: Number(row.change),
      volume: Number(row.volume),
      value: Number(row.value),
      frequency: Number(row.frequency),
      foreignBuy: Number(row.foreign_buy),
      foreignSell: Number(row.foreign_sell),
    }))
    .reverse();

  const latestRow = result.rows[0];
  return {
    name: String(latestRow.name || code),
    bars,
    lastFetchedAt: new Date(latestRow.fetched_at).toISOString(),
  };
}

const BROKER_SUMMARY_COLUMNS = [
  "code",
  "date",
  "side",
  "rank",
  "broker_code",
  "broker_name",
  "value",
  "lot",
  "avg_price",
  "source",
] as const;

/** Upsert one stock's buy+sell broker distribution for one date. */
export async function upsertBrokerSummary(
  code: string,
  date: string,
  distribution: BrokerDistribution,
  source = "stockbit"
): Promise<number> {
  const rows: Array<{ side: "buy" | "sell"; row: BrokerRow }> = [
    ...distribution.buy.map((row) => ({ side: "buy" as const, row })),
    ...distribution.sell.map((row) => ({ side: "sell" as const, row })),
  ];
  if (rows.length === 0) return 0;

  await ensureSchema();
  const pool = getPool();

  const values: unknown[] = [];
  const tuples = rows.map(({ side, row }, idx) => {
    const base = idx * BROKER_SUMMARY_COLUMNS.length;
    values.push(
      code,
      date,
      side,
      row.rank,
      row.brokerCode,
      row.brokerName,
      row.value,
      row.lot,
      row.avgPrice,
      source
    );
    const placeholders = BROKER_SUMMARY_COLUMNS.map((_, c) => `$${base + c + 1}`).join(", ");
    return `(${placeholders})`;
  });

  const sql = `
    INSERT INTO broker_summary (${BROKER_SUMMARY_COLUMNS.join(", ")})
    VALUES ${tuples.join(", ")}
    ON CONFLICT (code, date, side, rank, source) DO UPDATE SET
      broker_code = EXCLUDED.broker_code,
      broker_name = EXCLUDED.broker_name,
      value = EXCLUDED.value,
      lot = EXCLUDED.lot,
      avg_price = EXCLUDED.avg_price,
      fetched_at = now()
  `;
  await pool.query(sql, values);
  return rows.length;
}

export interface StoredBrokerSummary {
  date: string;
  buy: BrokerRow[];
  sell: BrokerRow[];
}

/** Latest stored broker summary for a stock (most recent date on record). */
export async function getLatestBrokerSummary(
  code: string,
  source = "stockbit"
): Promise<StoredBrokerSummary | null> {
  await ensureSchema();
  const pool = getPool();
  const latest = await pool.query(
    `SELECT MAX(date) AS date FROM broker_summary WHERE code = $1 AND source = $2`,
    [code, source]
  );
  const date = latest.rows[0]?.date;
  if (!date) return null;

  const result = await pool.query(
    `SELECT side, rank, broker_code, broker_name, value, lot, avg_price
     FROM broker_summary WHERE code = $1 AND date = $2 AND source = $3
     ORDER BY side, rank`,
    [code, date, source]
  );

  const buy: BrokerRow[] = [];
  const sell: BrokerRow[] = [];
  for (const row of result.rows) {
    const entry: BrokerRow = {
      rank: Number(row.rank),
      brokerCode: String(row.broker_code),
      brokerName: String(row.broker_name || ""),
      value: Number(row.value),
      lot: Number(row.lot),
      avgPrice: Number(row.avg_price),
    };
    if (row.side === "buy") buy.push(entry);
    else sell.push(entry);
  }

  return { date: String(date), buy, sell };
}

export async function getLatestIngestionRun(): Promise<
  { runDate: string; rowsUpserted: number; status: string; ranAt: string } | null
> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT run_date, rows_upserted, status, ran_at FROM ingestion_log ORDER BY ran_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    runDate: String(row.run_date),
    rowsUpserted: Number(row.rows_upserted),
    status: String(row.status),
    ranAt: new Date(row.ran_at).toISOString(),
  };
}
