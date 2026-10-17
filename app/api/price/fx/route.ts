import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // 1차 시도: Yahoo Finance 실시간 원/달러 환율 (KRW=X)
  try {
    const yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=1m";
    const res = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const rate = Number(result?.meta?.regularMarketPrice);
      const marketTime = result?.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString();

      if (rate && rate > 900 && rate < 2500) {
        return NextResponse.json({
          rate,
          source: "Yahoo Finance (KRW=X)",
          timestamp: marketTime,
        });
      }
    }
  } catch (e) {
    console.error("Yahoo FX Fetch failed, trying fallback...", e);
  }

  // 2차 폴백 시도: Open Exchange Rates API (무인증 공식 환율 엔드포인트)
  try {
    const fallbackRes = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
    });
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      const rate = Number(fallbackData?.rates?.KRW);
      if (rate && rate > 900 && rate < 2500) {
        return NextResponse.json({
          rate,
          source: "ExchangeRate-API (open.er-api.com)",
          timestamp: fallbackData?.time_last_update_utc
            ? new Date(fallbackData.time_last_update_utc).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Fallback FX Fetch failed:", e);
  }

  return NextResponse.json({ error: "Failed to fetch exchange rate" }, { status: 500 });
}