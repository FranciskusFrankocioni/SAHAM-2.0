"""Backfills historical IDX daily snapshots into Postgres.

Loops backward over business days calling the same fetch/normalize/upsert
logic as fetch_idx_daily.py. Meant to be run manually (once, or a few
times to page further back) via the "Backfill IDX history" GitHub Actions
workflow — not on a schedule.

Env vars:
  DATABASE_URL     required
  BACKFILL_DAYS    business days to fetch this run (default 30)
  BACKFILL_OFFSET  business days to skip before starting (default 0) —
                    increase this to page further into the past across
                    multiple runs, e.g. 0, then 30, then 60.
"""

import os
import sys
import time
from datetime import timedelta

import psycopg2

from fetch_idx_daily import (
    SCHEMA_SQL,
    fetch_snapshot,
    jakarta_today,
    log_ingestion,
    normalize,
    normalize_database_url,
    upsert_daily_bars,
)

REQUEST_DELAY_SECONDS = 1.5


def business_dates_going_back(count: int, offset_days: int = 0):
    dates = []
    cursor = jakarta_today() - timedelta(days=offset_days)
    guard = 0
    while len(dates) < count and guard < count * 4 + 30:
        guard += 1
        if cursor.weekday() < 5:  # Monday=0 .. Sunday=6
            dates.append(cursor)
        cursor -= timedelta(days=1)
    return dates


def main() -> int:
    database_url = normalize_database_url(os.environ.get("DATABASE_URL", ""))
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    days = int(os.environ.get("BACKFILL_DAYS", "30"))
    offset = int(os.environ.get("BACKFILL_OFFSET", "0"))

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()

        dates = business_dates_going_back(days, offset)
        total_written = 0
        for d in dates:
            iso_date = d.strftime("%Y-%m-%d")
            compact = d.strftime("%Y%m%d")
            try:
                raw_rows = fetch_snapshot(compact)
                rows = normalize(raw_rows, iso_date)
                if rows:
                    written = upsert_daily_bars(conn, rows)
                    log_ingestion(conn, iso_date, written, "ok")
                    total_written += written
                    print(f"{iso_date}: OK ({written} rows)")
                else:
                    log_ingestion(conn, iso_date, 0, "empty")
                    print(f"{iso_date}: empty (holiday/weekend?)")
            except Exception as exc:  # noqa: BLE001
                log_ingestion(conn, iso_date, 0, "error", str(exc)[:500])
                print(f"{iso_date}: ERROR {exc}", file=sys.stderr)
            time.sleep(REQUEST_DELAY_SECONDS)

        print(f"Done. Total rows written across {len(dates)} day(s): {total_written}")
        print(f"Next: BACKFILL_OFFSET={offset + days} to continue further back.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
