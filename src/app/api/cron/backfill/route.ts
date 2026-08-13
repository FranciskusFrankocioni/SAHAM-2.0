import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import {
  businessDatesGoingBack,
  createIdxSession,
  fetchDailySnapshot,
  mapWithConcurrency,
  toIsoDate,
} from "@/lib/idx/idxSource";
import { upsertDailyBars, logIngestion } from "@/lib/db/store";

export const maxDuration = 300;

const MAX_DAYS_PER_CALL = 30;
const CONCURRENCY = 4;

/**
 * One-off/manual endpoint to seed history before the daily cron has had
 * time to accumulate it (or to backfill a gap). Not scheduled by
 * vercel.json — call it yourself with the CRON_SECRET bearer token.
 *
 * Chunked on purpose: functions have a max duration, and IDX gets one
 * request per day fetched. Page through history with `days` + `offset`,
 * e.g. days=30&offset=0, then days=30&offset=30, etc.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<your-app>/api/cron/backfill?days=30&offset=0"
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(
    MAX_DAYS_PER_CALL,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? "30"))
  );
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? "0"));

  const dates = businessDatesGoingBack(days, offset);

  let session;
  try {
    session = await createIdxSession();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to establish IDX session" },
      { status: 502 }
    );
  }

  const settled = await mapWithConcurrency(dates, CONCURRENCY, async (date) => {
    const isoDate = toIsoDate(date);
    const rows = await fetchDailySnapshot(date, session);
    if (rows.length === 0) {
      await logIngestion(isoDate, 0, "empty");
      return { date: isoDate, rows: 0 };
    }
    const written = await upsertDailyBars(rows);
    await logIngestion(isoDate, written, "ok");
    return { date: isoDate, rows: written };
  });

  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { date: toIsoDate(dates[i]), rows: 0, error: String(r.reason) };
  });

  const nextOffset = offset + days;

  return NextResponse.json({
    processed: results,
    nextOffset,
    hint: `Continue with ?days=${days}&offset=${nextOffset} to go further back.`,
  });
}
