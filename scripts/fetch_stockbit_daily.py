"""Fetches daily price/volume/foreign-flow history for the watchlist from
Stockbit, replacing the IDX-direct approach in fetch_idx_daily.py.

Why: idx.co.id blocks GitHub Actions' IP ranges with a Cloudflare
"Attention Required" interactive challenge — confirmed live on
2026-08-16, even with curl_cffi's Chrome TLS impersonation. That's not a
fingerprint problem curl_cffi can solve; it needs either a residential
IP or an actual browser solving the challenge. Stockbit's API
(exodus.stockbit.com) is authenticated (Bearer token) rather than a
public scrape target, and hasn't shown the same behavior in community
use, so price/volume/foreign-flow data now comes from there instead.

Endpoint & response shape reconstructed from community open-source
projects (Stockbit has no official docs) — see satriyop/ai-saham's
docs/stockbit_api_probe_response.md for a live-probed example:

  GET /company-price-feed/historical/summary/{ticker}
      ?period=HS_PERIOD_DAILY&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
      &limit=N&page=P
  -> {"data": {"result": [{date, open, high, low, close, change,
       change_percentage, average, volume, value, frequency,
       foreign_buy, foreign_sell, net_foreign}], "paginate": {...}}}

Unit notes (confirmed via the probe doc):
  - `volume` is in LOTS (1 lot = 100 shares in IDX) — converted to
    shares on ingest to match this site's existing chart/indicator units.
  - `foreign_buy`/`foreign_sell` are IDR VALUE, not share volume — a
    different unit than the old IDX-sourced columns, but reused as-is
    (arguably more informative for "akumulasi asing" anyway).

Scoped to WATCHLIST_CODES only, same reasoning as fetch_broker_summary
in the Next.js app: this rides the user's own Stockbit account, so
keeping it to a personal watchlist (not the whole market) keeps the
access pattern reasonable.
"""

import os
import sys
import time
from datetime import timedelta

import psycopg2
from curl_cffi import requests

from fetch_idx_daily import (
    SCHEMA_SQL,
    jakarta_today,
    log_ingestion,
    normalize_database_url,
    to_number,
    upsert_daily_bars,
)

BASE_URL = "https://exodus.stockbit.com"
REQUEST_TIMEOUT = 20
REQUEST_DELAY_SECONDS = 0.8
LOOKBACK_DAYS = 7  # buffer over weekends/holidays; upsert makes re-fetching cheap


class StockbitAuthError(Exception):
    pass


def stockbit_headers(token: str) -> dict:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) "
            "Gecko/20100101 Firefox/137.0"
        ),
    }


def fetch_historical_summary(
    ticker: str, token: str, start_date: str, end_date: str, limit: int = 250, page: int = 1
) -> list[dict]:
    url = (
        f"{BASE_URL}/company-price-feed/historical/summary/{ticker}"
        f"?period=HS_PERIOD_DAILY&start_date={start_date}&end_date={end_date}"
        f"&limit={limit}&page={page}"
    )
    resp = requests.get(
        url, impersonate="chrome", headers=stockbit_headers(token), timeout=REQUEST_TIMEOUT
    )
    if resp.status_code in (401, 403):
        raise StockbitAuthError(f"Stockbit token rejected (HTTP {resp.status_code}) for {ticker}")
    if resp.status_code != 200:
        body_preview = (resp.text or "")[:300]
        raise RuntimeError(f"Stockbit HTTP {resp.status_code} for {ticker}: {body_preview!r}")
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) else None
    result = (data or {}).get("result")
    return result if isinstance(result, list) else []


def normalize_bars(ticker: str, raw_rows: list[dict]) -> list[dict]:
    bars = []
    for row in raw_rows:
        if not isinstance(row, dict):
            continue
        date = row.get("date")
        if not date:
            continue
        close = to_number(row.get("close"))
        change = to_number(row.get("change"))
        bars.append({
            "code": ticker.upper(),
            "date": str(date)[:10],
            "name": "",
            "prev_close": close - change,
            "open": to_number(row.get("open")),
            "high": to_number(row.get("high")),
            "low": to_number(row.get("low")),
            "close": close,
            "change": change,
            "volume": to_number(row.get("volume")) * 100,  # lots -> shares
            "value": to_number(row.get("value")),
            "frequency": to_number(row.get("frequency")),
            "foreign_buy": to_number(row.get("foreign_buy")),
            "foreign_sell": to_number(row.get("foreign_sell")),
        })
    return bars


def main() -> int:
    token = os.environ.get("STOCKBIT_TOKEN")
    if not token:
        print("ERROR: STOCKBIT_TOKEN is not set", file=sys.stderr)
        return 1

    watchlist = [
        c.strip().upper() for c in os.environ.get("WATCHLIST_CODES", "").split(",") if c.strip()
    ]
    if not watchlist:
        print("ERROR: WATCHLIST_CODES is not set (comma-separated stock codes)", file=sys.stderr)
        return 1

    database_url = normalize_database_url(os.environ.get("DATABASE_URL", ""))
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    today = jakarta_today()
    end_date = today.strftime("%Y-%m-%d")
    start_date = (today - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    run_date = today.strftime("%Y-%m-%d")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()

        total_written = 0
        token_expired = False
        for ticker in watchlist:
            if token_expired:
                print(f"{ticker}: skipped (token expired earlier in this run)")
                continue
            try:
                raw_rows = fetch_historical_summary(ticker, token, start_date, end_date)
                bars = normalize_bars(ticker, raw_rows)
                written = upsert_daily_bars(conn, bars) if bars else 0
                total_written += written
                print(f"{ticker}: OK ({written} rows)")
            except StockbitAuthError as exc:
                token_expired = True
                print(f"{ticker}: TOKEN EXPIRED - {exc}", file=sys.stderr)
            except Exception as exc:  # noqa: BLE001
                print(f"{ticker}: ERROR {exc}", file=sys.stderr)
            time.sleep(REQUEST_DELAY_SECONDS)

        if token_expired:
            status = "error"
            detail = f"Stockbit token expired mid-run ({total_written} rows written before failing)"
        elif total_written > 0:
            status = "ok"
            detail = f"stockbit watchlist: {len(watchlist)} ticker(s)"
        else:
            status = "empty"
            detail = "No rows returned for any watchlist ticker"

        log_ingestion(conn, run_date, total_written, status, detail)
        print(f"Done. Total rows upserted: {total_written}")
        return 1 if token_expired else 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
