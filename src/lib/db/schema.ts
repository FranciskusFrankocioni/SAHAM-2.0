import { getPool } from "./client";

let schemaReady: Promise<void> | null = null;

/** Idempotent; safe to call on every request/route invocation. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `
        CREATE TABLE IF NOT EXISTS daily_bars (
          code TEXT NOT NULL,
          date TEXT NOT NULL,
          name TEXT,
          prev_close NUMERIC,
          open NUMERIC,
          high NUMERIC,
          low NUMERIC,
          close NUMERIC,
          change NUMERIC,
          volume BIGINT,
          value BIGINT,
          frequency BIGINT,
          foreign_buy BIGINT,
          foreign_sell BIGINT,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (code, date)
        );
        CREATE INDEX IF NOT EXISTS daily_bars_code_date_idx ON daily_bars (code, date DESC);

        CREATE TABLE IF NOT EXISTS ingestion_log (
          id SERIAL PRIMARY KEY,
          run_date TEXT NOT NULL,
          rows_upserted INTEGER NOT NULL,
          status TEXT NOT NULL,
          detail TEXT,
          ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS broker_summary (
          code TEXT NOT NULL,
          date TEXT NOT NULL,
          side TEXT NOT NULL,
          rank SMALLINT NOT NULL,
          broker_code TEXT NOT NULL,
          broker_name TEXT,
          value NUMERIC,
          lot NUMERIC,
          avg_price NUMERIC,
          source TEXT NOT NULL DEFAULT 'stockbit',
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (code, date, side, rank, source)
        );
        CREATE INDEX IF NOT EXISTS broker_summary_code_date_idx ON broker_summary (code, date DESC);
        `
      )
      .then(() => undefined)
      .catch((err) => {
        // Let the next call retry instead of caching a failed migration.
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}
