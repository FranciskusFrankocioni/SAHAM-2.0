import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { createIdxSession, fetchDailySnapshot, toIsoDate } from "@/lib/idx/idxSource";
import { upsertDailyBars, logIngestion } from "@/lib/db/store";
import { IdxUnavailableError } from "@/lib/idx/types";

export const maxDuration = 60;

/**
 * Meant to be called once per trading day, after IDX's market close, by
 * Vercel Cron (see vercel.json). Fetches that single day's full-market
 * snapshot from IDX in one request and upserts it into Postgres. Never
 * called from a page request — see src/lib/idx/provider.ts for the
 * read path pages actually use.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const isoDate = toIsoDate(date);

  try {
    const session = await createIdxSession();
    const rows = await fetchDailySnapshot(date, session);

    if (rows.length === 0) {
      await logIngestion(isoDate, 0, "empty", "No rows returned (holiday/weekend or IDX issue)");
      return NextResponse.json({ date: isoDate, status: "empty", rows: 0 });
    }

    const written = await upsertDailyBars(rows);
    await logIngestion(isoDate, written, "ok");

    return NextResponse.json({ date: isoDate, status: "ok", rows: written });
  } catch (err) {
    const message =
      err instanceof IdxUnavailableError || err instanceof Error
        ? err.message
        : "Unknown error";
    await logIngestion(isoDate, 0, "error", message).catch(() => {
      // DB may itself be unreachable; don't mask the original error.
    });
    return NextResponse.json({ date: isoDate, status: "error", error: message }, { status: 502 });
  }
}
