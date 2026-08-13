import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db/client";
import { getLatestIngestionRun } from "@/lib/db/store";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ dbConfigured: false, lastRun: null });
  }
  try {
    const lastRun = await getLatestIngestionRun();
    return NextResponse.json({ dbConfigured: true, lastRun });
  } catch (err) {
    return NextResponse.json(
      { dbConfigured: true, lastRun: null, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}
