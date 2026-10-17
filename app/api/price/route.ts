import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch from Yahoo Finance" }, { status: response.status });
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "No chart data found" }, { status: 404 });
    }

    const meta = result.meta;
    const rawCloses: any[] = result.indicators?.quote?.[0]?.close || [];
    const closes: number[] = rawCloses.filter((c: any) => typeof c === "number" && !isNaN(c));

    const currentPrice = Number(meta?.regularMarketPrice ?? closes[closes.length - 1] ?? 0);

    // 1. 일단위 (1D) 변동률
    const prevClose1D = closes.length >= 2 ? closes[closes.length - 2] : (meta?.chartPreviousClose || currentPrice);
    const dailyReturn = prevClose1D > 0 ? ((currentPrice - prevClose1D) / prevClose1D) * 100 : 0;

    // 2. 주단위 (1W) 변동률
    const idx1W = Math.max(0, closes.length - 6);
    const prevClose1W = closes[idx1W] || currentPrice;
    const weeklyReturn = prevClose1W > 0 ? ((currentPrice - prevClose1W) / prevClose1W) * 100 : 0;

    // 3. 월단위 (1M) 변동률
    const idx1M = Math.max(0, closes.length - 22);
    const prevClose1M = closes[idx1M] || currentPrice;
    const monthlyReturn = prevClose1M > 0 ? ((currentPrice - prevClose1M) / prevClose1M) * 100 : 0;

    // 4. 연단위 (1Y) 변동률
    const prevClose1Y = closes[0] || meta?.chartPreviousClose || currentPrice;
    const yearlyReturn = prevClose1Y > 0 ? ((currentPrice - prevClose1Y) / prevClose1Y) * 100 : 0;

    const marketTime = meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

    return NextResponse.json({
      price: currentPrice,
      dailyReturn,
      weeklyReturn,
      monthlyReturn,
      yearlyReturn,
      exchangeName: meta?.fullExchangeName || meta?.exchangeName || "Yahoo Finance",
      marketTime,
    });
  } catch (error) {
    console.error("Price API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}