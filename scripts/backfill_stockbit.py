"""Backfills historical daily price/volume/foreign-flow for the watchlist
from Stockbit. Unlike the old IDX approach (one full-market snapshot per
day), Stockbit's historical/summary endpoint takes a date range directly,
so backfilling months of history per ticker is a handful of paginated
calls instead of one call per calendar day.

Meant to be run manually (workflow_dispatch), not on a schedule.

Env vars:
  STOCKBIT_TOKEN    required
  DATABASE_URL      required
  WATCHLIST_CODES   optional, comma-separated; defaults to DEFAULT_WATCHLIST
                     in fetch_stockbit_daily.py
  BACKFILL_DAYS     calendar days of history to fetch (default 90)
"""

import os
import sys
import time

import psycopg2

from fetch_idx_daily import SCHEMA_SQL, jakarta_today, log_ingestion, normalize_database_url
from fetch_stockbit_daily import (
    DEFAULT_WATCHLIST,
    StockbitAuthError,
    fetch_historical_summary,
    normalize_bars,
)
from datetime import timedelta
from fetch_idx_daily import upsert_daily_bars

REQUEST_DELAY_SECONDS = 1.0
PAGE_LIMIT = 250


def fetch_all_pages(ticker: str, token: str, start_date: str, end_date: str) -> list[dict]:
    all_rows: list[dict] = []
    page = 1
    while True:
        rows = fetch_historical_summary(
            ticker, token, start_date, end_date, limit=PAGE_LIMIT, page=page
        )
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < PAGE_LIMIT:
            break
        page += 1
        if page > 10:  # safety valve against unexpected pagination loops
            break
        time.sleep(REQUEST_DELAY_SECONDS)
    return all_rows


def main() -> int:
    token = os.environ.get("STOCKBIT_TOKEN")
    if not token:
        print("ERROR: STOCKBIT_TOKEN is not set", file=sys.stderr)
        return 1

    watchlist_raw = os.environ.get("WATCHLIST_CODES", "")
    watchlist = (
        [c.strip().upper() for c in watchlist_raw.split(",") if c.strip()]
        if watchlist_raw.strip()
        else list(DEFAULT_WATCHLIST)
    )

    database_url = normalize_database_url(os.environ.get("DATABASE_URL", ""))
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    days = int(os.environ.get("BACKFILL_DAYS", "90"))
    today = jakarta_today()
    end_date = today.strftime("%Y-%m-%d")
    start_date = (today - timedelta(days=days)).strftime("%Y-%m-%d")
    run_date = today.strftime("%Y-%m-%d")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()

        total_written = 0
        for ticker in watchlist:
            try:
                raw_rows = fetch_all_pages(ticker, token, start_date, end_date)
                bars = normalize_bars(ticker, raw_rows)
                written = upsert_daily_bars(conn, bars) if bars else 0
                total_written += written
                print(f"{ticker}: OK ({written} rows)")
            except StockbitAuthError as exc:
                print(f"{ticker}: TOKEN EXPIRED - {exc}", file=sys.stderr)
                break
            except Exception as exc:  # noqa: BLE001
                print(f"{ticker}: ERROR {exc}", file=sys.stderr)
            time.sleep(REQUEST_DELAY_SECONDS)

        log_ingestion(
            conn, run_date, total_written, "ok" if total_written else "empty",
            f"backfill_stockbit: {len(watchlist)} ticker(s), {days} days"
        )
        print(f"Done. Total rows upserted across {len(watchlist)} ticker(s): {total_written}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
