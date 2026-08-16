"""Fetches one day's full-market IDX trading summary and upserts it into
Postgres, using curl_cffi to impersonate a real Chrome TLS/HTTP fingerprint.

Why this exists (not just the Node.js route in src/app/api/cron/):
idx.co.id's /primary/* JSON endpoints returned HTTP 403 from Vercel's
Node.js runtime even after adding a proper session cookie, which points
to fingerprint-level bot detection (TLS/HTTP2 handshake), not just a
missing cookie. Node's fetch() has no easy way to spoof that. curl_cffi
does, by impersonating Chrome's actual TLS fingerprint, and is the
technique used by the actively-maintained open-source `idx-bei` project
against the same endpoints.

Run via `.github/workflows/fetch-daily.yml` (GitHub Actions), not Vercel
Cron, since it needs a Python + curl_cffi environment. Talks directly to
Postgres (same schema as src/lib/db/schema.ts) rather than going through
the Next.js app.
"""

import os
import re
import sys
from datetime import datetime, timedelta, timezone

import psycopg2
from psycopg2.extras import execute_values
from curl_cffi import requests

BASE_URL = "https://www.idx.co.id/primary/TradingSummary/GetStockSummary"
REQUEST_TIMEOUT = 30

FIELD_ALIASES = {
    "code": ["stockcode", "code"],
    "name": ["stockname", "name"],
    "prev_close": ["previous", "previousprice"],
    "open": ["openprice", "firsttrade"],
    "high": ["high", "highprice"],
    "low": ["low", "lowprice"],
    "close": ["close", "closeprice"],
    "change": ["change"],
    "volume": ["volume", "tradingvolume"],
    "value": ["value", "tradingvalue"],
    "frequency": ["frequency", "tradingfrequency"],
    "foreign_buy": ["foreignbuy", "foreignbuyvolume"],
    "foreign_sell": ["foreignsell", "foreignsellvolume"],
}

DAILY_BARS_COLUMNS = [
    "code", "date", "name", "prev_close", "open", "high", "low", "close",
    "change", "volume", "value", "frequency", "foreign_buy", "foreign_sell",
]

SCHEMA_SQL = """
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
"""


def pick(row_lower: dict, keys: list[str]):
    for key in keys:
        value = row_lower.get(key)
        if value not in (None, ""):
            return value
    return None


def to_number(value) -> float:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").strip())
        except ValueError:
            return 0
    return 0


def jakarta_today() -> datetime:
    # IDX dates are Jakarta-local (UTC+7); approximate without a tz database.
    return datetime.now(timezone.utc) + timedelta(hours=7)


def normalize_database_url(raw: str) -> str:
    """Tolerates common copy/paste mistakes: pasting a whole .env-style
    snippet (comment lines, multiple KEY=value lines) instead of just the
    connection string. Extracts the first postgres(ql):// URL found and
    strips surrounding quotes/whitespace.
    """
    match = re.search(r"postgres(?:ql)?://\S+", raw.strip())
    if not match:
        return raw.strip()
    return match.group(0).strip("'\" \t\r\n")


def fetch_snapshot(date_compact: str) -> list[dict]:
    url = f"{BASE_URL}?length=9999&start=0&date={date_compact}"
    resp = requests.get(
        url,
        impersonate="chrome",
        headers={
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
            "Referer": "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham",
        },
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code != 200:
        server_header = resp.headers.get("server", "?")
        body_preview = (resp.text or "")[:800].replace("\n", " ")
        raise RuntimeError(
            f"HTTP {resp.status_code} from IDX (server={server_header}). "
            f"Body preview: {body_preview!r}"
        )
    data = resp.json()
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return data["data"]
    return []


def normalize(raw_rows: list[dict], iso_date: str) -> list[dict]:
    normalized = []
    for raw in raw_rows:
        if not isinstance(raw, dict):
            continue
        row_lower = {str(k).lower(): v for k, v in raw.items()}
        code = pick(row_lower, FIELD_ALIASES["code"])
        if not code:
            continue
        normalized.append({
            "code": str(code).upper(),
            "date": iso_date,
            "name": str(pick(row_lower, FIELD_ALIASES["name"]) or ""),
            "prev_close": to_number(pick(row_lower, FIELD_ALIASES["prev_close"])),
            "open": to_number(pick(row_lower, FIELD_ALIASES["open"])),
            "high": to_number(pick(row_lower, FIELD_ALIASES["high"])),
            "low": to_number(pick(row_lower, FIELD_ALIASES["low"])),
            "close": to_number(pick(row_lower, FIELD_ALIASES["close"])),
            "change": to_number(pick(row_lower, FIELD_ALIASES["change"])),
            "volume": to_number(pick(row_lower, FIELD_ALIASES["volume"])),
            "value": to_number(pick(row_lower, FIELD_ALIASES["value"])),
            "frequency": to_number(pick(row_lower, FIELD_ALIASES["frequency"])),
            "foreign_buy": to_number(pick(row_lower, FIELD_ALIASES["foreign_buy"])),
            "foreign_sell": to_number(pick(row_lower, FIELD_ALIASES["foreign_sell"])),
        })
    return normalized


def upsert_daily_bars(conn, rows: list[dict]) -> int:
    if not rows:
        return 0
    values = [[row[col] for col in DAILY_BARS_COLUMNS] for row in rows]
    sql = f"""
        INSERT INTO daily_bars ({", ".join(DAILY_BARS_COLUMNS)})
        VALUES %s
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
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, values)
    conn.commit()
    return len(rows)


def log_ingestion(conn, run_date: str, rows_upserted: int, status: str, detail: str | None = None):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingestion_log (run_date, rows_upserted, status, detail) VALUES (%s, %s, %s, %s)",
            (run_date, rows_upserted, status, detail),
        )
    conn.commit()


def main() -> int:
    database_url = normalize_database_url(os.environ.get("DATABASE_URL", ""))
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    now = jakarta_today()
    iso_date = now.strftime("%Y-%m-%d")
    date_compact = now.strftime("%Y%m%d")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()

        try:
            raw_rows = fetch_snapshot(date_compact)
        except Exception as exc:  # noqa: BLE001 - want to log any failure mode
            log_ingestion(conn, iso_date, 0, "error", str(exc)[:500])
            print(f"ERROR fetching IDX snapshot: {exc}", file=sys.stderr)
            return 1

        rows = normalize(raw_rows, iso_date)
        if not rows:
            log_ingestion(conn, iso_date, 0, "empty", "No rows returned (holiday/weekend or IDX issue)")
            print(f"No rows returned for {iso_date} (holiday/weekend or unexpected response shape)")
            return 0

        written = upsert_daily_bars(conn, rows)
        log_ingestion(conn, iso_date, written, "ok")
        print(f"OK: upserted {written} rows for {iso_date}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
