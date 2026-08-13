import type { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on cron-triggered
 * requests when CRON_SECRET is set as a project env var. Manual/backfill
 * calls must send the same header. If CRON_SECRET isn't set, ingestion
 * routes refuse to run rather than being left open on a public URL.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
