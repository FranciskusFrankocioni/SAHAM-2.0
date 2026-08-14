import type { NextRequest } from "next/server";

/**
 * Vercel Cron and the GitHub Actions workflow send
 * `Authorization: Bearer $CRON_SECRET`. A `?secret=` query param is also
 * accepted so these routes can be triggered by just visiting a URL in a
 * browser (no header tooling required) — handy for manual testing from a
 * phone/tablet. If CRON_SECRET isn't set, ingestion routes refuse to run
 * rather than being left open on a public URL.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}
