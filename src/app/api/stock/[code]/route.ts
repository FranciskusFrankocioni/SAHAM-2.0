import { NextRequest, NextResponse } from "next/server";
import { getStockHistory } from "@/lib/idx/provider";
import { analyzeStock } from "@/lib/idx/indicators";

const CODE_PATTERN = /^[A-Z0-9]{2,5}$/;
const MAX_TRADING_DAYS = 90;
const MIN_TRADING_DAYS = 5;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();

  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: "Kode saham tidak valid." },
      { status: 400 }
    );
  }

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const tradingDays = Math.min(
    MAX_TRADING_DAYS,
    Math.max(MIN_TRADING_DAYS, Number.isFinite(daysParam) ? daysParam : 30)
  );

  const history = await getStockHistory(code, tradingDays);
  const analysis = analyzeStock(history.bars);

  return NextResponse.json({
    code: history.code,
    name: history.name,
    source: history.source,
    warning: history.warning ?? null,
    asOf: history.asOf,
    tradingDate: history.tradingDate,
    overallSignal: analysis.overallSignal,
    foreignNetTotal: analysis.foreignNetTotal,
    adLineChange: analysis.adLineChange,
    distribusiRetailDays: analysis.distribusiRetailDays,
    bars: analysis.bars,
  });
}
