import { Pool } from "@neondatabase/serverless";

// Vercel's Neon integration (and most Postgres providers) populate
// DATABASE_URL; some older Vercel Postgres projects use POSTGRES_URL.
// Support both so the connection string doesn't need renaming.
function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function isDbConfigured(): boolean {
  return Boolean(connectionString());
}

let pool: Pool | null = null;

export function getPool(): Pool {
  const cs = connectionString();
  if (!cs) {
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL) is not set. Attach a Postgres database " +
        "(e.g. Neon, via the Vercel Storage tab) and set the connection string."
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString: cs });
  }
  return pool;
}
