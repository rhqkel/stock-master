import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // 1차 시도: Open Exchange Rates API (클라우드 IP 차단 없음, 실시간성 우수)
  try {
    const res1 = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
    });
    if (res1.ok) {
      const data1 = await res1.json();
      const rate1 = Number(data1?.rates?.KRW);
      if (rate1 && rate1 > 900 && rate1 < 2500) {
        return NextResponse.json({
          rate: rate1,
          source: "ExchangeRate-API (open.er-api.com)",
          timestamp: data1?.time_last_update_utc
            ? new Date(data1.time_last_update_utc).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Primary FX API failed:", e);
  }

  // 2차 시도: Frankfurter API (유럽중앙은행 공식 기준환율 데이터)
  try {
    const res2 = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW", {
      cache: "no-store",
    });
    if (res2.ok) {
      const data2 = await res2.json();
      const rate2 = Number(data2?.rates?.KRW);
      if (rate2 && rate2 > 900 && rate2 < 2500) {
        return NextResponse.json({
          rate: rate2,
          source: "ECB Frankfurter API (api.frankfurter.app)",
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Secondary FX API failed:", e);
  }

  // 3차 시도: Yahoo Finance (KRW=X)
  try {
    const yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=1m";
    const res3 = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (res3.ok) {
      const data3 = await res3.json();
      const result = data3?.chart?.result?.[0];
      const rate3 = Number(result?.meta?.regularMarketPrice);
      const marketTime = result?.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString();

      if (rate3 && rate3 > 900 && rate3 < 2500) {
        return NextResponse.json({
          rate: rate3,
          source: "Yahoo Finance (KRW=X)",
          timestamp: marketTime,
        });
      }
    }
  } catch (e) {
    console.error("Tertiary Yahoo FX Fetch failed:", e);
  }

  return NextResponse.json({ error: "All FX sources failed" }, { status: 500 });
}