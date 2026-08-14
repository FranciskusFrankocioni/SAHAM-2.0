import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { fetchBrokerDistribution } from "@/lib/stockbit/stockbitSource";
import { StockbitAuthError, StockbitUnavailableError } from "@/lib/stockbit/types";
import { upsertBrokerSummary, logIngestion } from "@/lib/db/store";
import { toIsoDate } from "@/lib/idx/idxSource";

export const maxDuration = 60;

/**
 * Meant to be called once per trading day, after market close, by Vercel
 * Cron (see vercel.json). Fetches broker distribution (top-5 buy/sell) for
 * a fixed watchlist of stocks — not the whole market — via the user's own
 * Stockbit session token. See README for why this is scoped to a
 * watchlist and how to obtain/rotate STOCKBIT_TOKEN.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.STOCKBIT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "STOCKBIT_TOKEN is not set. See README for how to obtain one." },
      { status: 500 }
    );
  }

  const watchlist = (process.env.WATCHLIST_CODES ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  if (watchlist.length === 0) {
    return NextResponse.json(
      { error: "WATCHLIST_CODES is not set (comma-separated stock codes, e.g. BBCA,ADRO)." },
      { status: 500 }
    );
  }

  const date = toIsoDate(new Date());
  const results: Array<{ code: string; status: string; rows?: number; error?: string }> = [];
  let tokenExpired = false;

  for (const code of watchlist) {
    if (tokenExpired) {
      results.push({ code, status: "skipped", error: "token expired earlier in this run" });
      continue;
    }
    try {
      const distribution = await fetchBrokerDistribution(code, token);
      const written = await upsertBrokerSummary(code, date, distribution);
      results.push({ code, status: "ok", rows: written });
    } catch (err) {
      if (err instanceof StockbitAuthError) {
        tokenExpired = true;
        results.push({ code, status: "token_expired", error: err.message });
        continue;
      }
      const message =
        err instanceof StockbitUnavailableError || err instanceof Error
          ? err.message
          : "Unknown error";
      results.push({ code, status: "error", error: message });
    }
    // Small delay between requests so this looks like normal browsing, not a burst.
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  const totalRows = results.reduce((sum, r) => sum + (r.rows ?? 0), 0);
  const overallStatus = tokenExpired
    ? "token_expired"
    : okCount === watchlist.length
      ? "ok"
      : okCount > 0
        ? "partial"
        : "error";

  await logIngestion(
    date,
    totalRows,
    overallStatus === "ok" ? "ok" : overallStatus === "error" ? "error" : "empty",
    `broker_summary: ${okCount}/${watchlist.length} codes ok${tokenExpired ? " (token expired)" : ""}`
  ).catch(() => {});

  return NextResponse.json({ date, status: overallStatus, results });
}
