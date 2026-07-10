import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: '티커 매개변수가 누락되었습니다.' }, { status: 400 });
  }

  try {
    // 일일 및 연간 변동률 연산을 위해 1년(1y) 범위의 일간(1d) 데이터를 호출
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 60 } // 1분간 서버 캐싱하여 과도한 트래픽 방지
    });

    if (!response.ok) throw new Error('Yahoo Finance API 통신 실패');

    const data = await response.json();
    const result = data.chart.result?.[0];
    
    if (!result) {
      return NextResponse.json({ error: '데이터를 찾을 수 없습니다.' }, { status: 404 });
    }

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;

    // 1. 일일 변동률 계산
    const dailyReturn = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    // 2. 연간 변동률 계산 (1년 전 종가 데이터 추출)
    const closePrices = result.indicators.quote[0].close || [];
    const validPrices = closePrices.filter((p: any) => p !== null && p !== undefined);
    const oneYearAgoPrice = validPrices[0] || currentPrice;
    const yearlyReturn = ((currentPrice - oneYearAgoPrice) / oneYearAgoPrice) * 100;

    return NextResponse.json({
      price: currentPrice,
      dailyReturn: isNaN(dailyReturn) ? 0 : dailyReturn,
      yearlyReturn: isNaN(yearlyReturn) ? 0 : yearlyReturn
    });
  } catch (error) {
    console.error("오류 발생:", error);
    return NextResponse.json({ error: '시세 및 지수 데이터 추출 파싱 실패' }, { status: 500 });
  }
}