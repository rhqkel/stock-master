import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDKRW=X', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 } // 1시간 캐싱
    });
    const data = await response.json();
    const rate = data.chart.result[0].meta.regularMarketPrice;
    return NextResponse.json({ rate });
  } catch (error) {
    return NextResponse.json({ error: '환율 정보를 가져올 수 없습니다.' }, { status: 500 });
  }
}