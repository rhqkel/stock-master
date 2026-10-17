"use client";

import React, { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Treemap,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

// --- 1. 금융 데이터 인터페이스 정의 ---
interface Asset {
  id: string;
  category: string;
  name: string;
  quantity: number;
  avgPriceUsd: number;
  avgPriceKrw: number;
  currentPriceUsd: number;
  currentPriceKrw: number;
  return1D?: number;
  return1W?: number;
  return1M?: number;
  return1Y?: number;
}

interface MonthlyHistory {
  date: string; // YYYY.MM.01 포맷
  totalValueKrw: number;
  totalPrincipalKrw: number;
}

interface IndexState {
  daily: number;
  yearly: number;
}

type HeatmapPeriod = "1D" | "1W" | "1M" | "1Y" | "TOTAL";

const KOR_STOCK_DICT: Record<string, string> = {
  "삼성전자": "005930",
  "SK하이닉스": "000660",
  "현대차": "005380",
  "NAVER": "035420",
  "카카오": "035720",
};

const PIE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

// --- 히트맵 커스텀 렌더러 ---
const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, name, profitRate } = props;
  if (!width || !height) return null;

  const safeRate = typeof profitRate === "number" && !isNaN(profitRate) ? profitRate : 0;
  let bgColor = "#64748b"; // 0% 보합 (슬레이트)
  if (safeRate >= 5) bgColor = "#059669"; // 강한 상승
  else if (safeRate > 0) bgColor = "#10b981"; // 상승
  else if (safeRate <= -5) bgColor = "#e11d48"; // 강한 하락
  else if (safeRate < 0) bgColor = "#ef4444"; // 하락

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={bgColor} stroke="#ffffff" strokeWidth={2} rx={4} ry={4} />
      {width > 45 && height > 35 && (
        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold">
          {name}
        </text>
      )}
      {width > 45 && height > 52 && (
        <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" fill="#fff" fontSize={11}>
          {safeRate >= 0 ? "+" : ""}
          {safeRate.toFixed(2)}%
        </text>
      )}
    </g>
  );
};

export default function PortfolioDashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = useState<MonthlyHistory[]>([]);
  const [goal, setGoal] = useState<number>(10000000000);
  const [targetWeights, setTargetWeights] = useState<Record<string, number>>({});

  const [yesterdayValue, setYesterdayValue] = useState<number>(0);
  const [usdToKrw, setUsdToKrw] = useState<number>(1380);
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [heatmapPeriod, setHeatmapPeriod] = useState<HeatmapPeriod>("1D");

  const [marketIndices, setMarketIndices] = useState<Record<string, IndexState>>({
    nasdaq: { daily: 0, yearly: 0 },
    snp: { daily: 0, yearly: 0 },
    kospi: { daily: 0, yearly: 0 },
  });

  const [importText, setImportText] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [isLoaded, setIsLoaded] = useState(false);

  // 월별 자산 수동 추가 입력 상태
  const [manualDate, setManualDate] = useState<string>("");
  const [manualValueKrw, setManualValueKrw] = useState<string>("");
  const [manualPrincipalKrw, setManualPrincipalKrw] = useState<string>("");

  const getDisplayPrice = (priceInKrw: number) => {
    const val = Number(priceInKrw) || 0;
    return currency === "USD" ? val / usdToKrw : val;
  };

  const formatNum = (num: any) => {
    const val = Number(num);
    return isNaN(val) ? "0" : val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatCurrency = (num: any) => (currency === "USD" ? `$${formatNum(num)}` : `₩${formatNum(num)}`);

  // --- 자산 업데이트 로직 (현금인 경우 평단가와 현재시세 자동 일치) ---
  const updateAsset = (id: string, field: keyof Asset, val: string | number) => {
    setAssets((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const updated: Asset = { ...a, [field]: val };

        if (["quantity", "avgPriceUsd", "avgPriceKrw", "currentPriceUsd", "currentPriceKrw"].includes(field)) {
          (updated as any)[field] = Number(val) || 0;
        }

        // 카테고리를 '현금'으로 변경한 경우 수량 1로 고정 및 평단가=현재가 동기화
        if (field === "category" && val === "현금") {
          const baseUsd = updated.currentPriceUsd > 0 ? updated.currentPriceUsd : updated.avgPriceUsd * (updated.quantity || 1);
          const baseKrw = updated.currentPriceKrw > 0 ? updated.currentPriceKrw : updated.avgPriceKrw * (updated.quantity || 1);
          updated.quantity = 1;
          updated.currentPriceUsd = baseUsd;
          updated.avgPriceUsd = baseUsd;
          updated.currentPriceKrw = baseKrw;
          updated.avgPriceKrw = baseKrw;
          updated.return1D = 0;
          updated.return1W = 0;
          updated.return1M = 0;
          updated.return1Y = 0;
          return updated;
        }

        // 현금 자산의 현재 시세(보유액) 입력 시 평단가도 자동 동일화 (평단가 별도 입력 불필요)
        if (updated.category === "현금") {
          updated.quantity = 1;
          if (field === "currentPriceUsd") {
            updated.currentPriceKrw = Number(val) * usdToKrw;
          } else if (field === "currentPriceKrw") {
            updated.currentPriceUsd = Number(val) / usdToKrw;
          }
          updated.avgPriceUsd = updated.currentPriceUsd;
          updated.avgPriceKrw = updated.currentPriceKrw;
          return updated;
        }

        // 일반 자산의 매수 평단가 환산 연동
        if (field === "avgPriceUsd") updated.avgPriceKrw = Number(val) * usdToKrw;
        if (field === "avgPriceKrw") updated.avgPriceUsd = Number(val) / usdToKrw;

        return updated;
      })
    );
  };

  const removeAsset = (id: string) => setAssets((prev) => prev.filter((a) => a.id !== id));

  const addAsset = () =>
    setAssets((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        category: "미국주식",
        name: "종목명",
        quantity: 1,
        avgPriceUsd: 0,
        avgPriceKrw: 0,
        currentPriceUsd: 0,
        currentPriceKrw: 0,
        return1D: 0,
        return1W: 0,
        return1M: 0,
        return1Y: 0,
      },
    ]);

  const updateTargetWeight = (cat: string, val: string) =>
    setTargetWeights((prev) => ({ ...prev, [cat]: Number(val) || 0 }));

  // --- 지수 및 개별 종목 시세 Fetch ---
  const fetchGlobalIndices = async () => {
    const tickers = { nasdaq: "^IXIC", snp: "^GSPC", kospi: "^KS11" };
    for (const [key, ticker] of Object.entries(tickers)) {
      try {
        const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`);
        const data = await res.json();
        if (data.dailyReturn !== undefined && data.yearlyReturn !== undefined) {
          setMarketIndices((prev) => ({
            ...prev,
            [key]: { daily: Number(data.dailyReturn) || 0, yearly: Number(data.yearlyReturn) || 0 },
          }));
        }
      } catch (e) {
        console.error(`${key} 지수 갱신 실패`, e);
      }
    }
  };

  const fetchCurrentPrice = async (id: string, category: string, name: string, currentFx: number) => {
    if (category === "현금" || !name || name === "종목명") return;
    let tickerToSearch = name.trim();

    if (category === "가상자산" && !tickerToSearch.includes("-USD")) {
      tickerToSearch = `${tickerToSearch}-USD`;
    } else if (category === "국내주식") {
      if (KOR_STOCK_DICT[tickerToSearch]) tickerToSearch = `${KOR_STOCK_DICT[tickerToSearch]}.KS`;
      else if (/^\d{6}$/.test(tickerToSearch)) tickerToSearch = `${tickerToSearch}.KS`;
      else return;
    }

    try {
      const response = await fetch(`/api/price?ticker=${encodeURIComponent(tickerToSearch)}`);
      const data = await response.json();
      if (data.price) {
        let priceUsd = 0;
        let priceKrw = 0;
        if (category === "미국주식" || category === "가상자산") {
          priceUsd = Number(data.price) || 0;
          priceKrw = priceUsd * currentFx;
        } else if (category === "국내주식") {
          priceKrw = Number(data.price) || 0;
          priceUsd = priceKrw / currentFx;
        }
        setAssets((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  currentPriceUsd: priceUsd,
                  currentPriceKrw: priceKrw,
                  return1D: Number(data.dailyReturn) || 0,
                  return1W: Number(data.weeklyReturn) || 0,
                  return1M: Number(data.monthlyReturn) || 0,
                  return1Y: Number(data.yearlyReturn) || 0,
                }
              : a
          )
        );
      }
    } catch (error) {
      console.error("가격 동기화 오류", error);
    }
  };

  const fetchAllPrices = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      let latestFx = usdToKrw;
      try {
        const fxRes = await fetch("/api/fx");
        const fxData = await fxRes.json();
        if (fxData.rate) {
          latestFx = Number(fxData.rate);
          setUsdToKrw(latestFx);
        }
      } catch {}

      await fetchGlobalIndices();
      for (const asset of assets) {
        if (asset.category !== "현금") {
          await fetchCurrentPrice(asset.id, asset.category, asset.name, latestFx);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      const now = new Date();
      setLastUpdated(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
          now.getSeconds()
        ).padStart(2, "0")}`
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- 초기 로드 ---
  useEffect(() => {
    const savedAssets = localStorage.getItem("vr_portfolio_assets");
    const savedHistory = localStorage.getItem("vr_portfolio_history_v2");
    const savedGoal = localStorage.getItem("vr_portfolio_goal");
    const savedWeights = localStorage.getItem("vr_portfolio_weights");
    const savedYest = localStorage.getItem("vr_portfolio_yesterday");

    const now = new Date();
    const currentMonthDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.01`;
    setManualDate(currentMonthDate);

    if (savedAssets) {
      try {
        const parsed = JSON.parse(savedAssets).map((a: any) => {
          const isCash = a.category === "현금";
          const curUsd = Number(a.currentPriceUsd) || 0;
          const curKrw = Number(a.currentPriceKrw) || 0;
          return {
            id: a.id || Date.now().toString(),
            category: a.category || "현금",
            name: a.name || "",
            quantity: isCash ? 1 : Number(a.quantity) || 0,
            avgPriceUsd: isCash ? curUsd : Number(a.avgPriceUsd) || 0,
            avgPriceKrw: isCash ? curKrw : Number(a.avgPriceKrw) || 0,
            currentPriceUsd: curUsd,
            currentPriceKrw: curKrw,
            return1D: Number(a.return1D) || 0,
            return1W: Number(a.return1W) || 0,
            return1M: Number(a.return1M) || 0,
            return1Y: Number(a.return1Y) || 0,
          };
        });
        setAssets(parsed);
      } catch {
        setAssets([]);
      }
    } else {
      setAssets([
        {
          id: "1",
          category: "가상자산",
          name: "BTC",
          quantity: 1.317,
          avgPriceUsd: 66240,
          avgPriceKrw: 91413000,
          currentPriceUsd: 66240,
          currentPriceKrw: 91413000,
          return1D: 0,
          return1W: 0,
          return1M: 0,
          return1Y: 0,
        },
        {
          id: "2",
          category: "미국주식",
          name: "IREN",
          quantity: 943,
          avgPriceUsd: 47.1,
          avgPriceKrw: 65000,
          currentPriceUsd: 47.1,
          currentPriceKrw: 65000,
          return1D: 0,
          return1W: 0,
          return1M: 0,
          return1Y: 0,
        },
        {
          id: "3",
          category: "현금",
          name: "VR 예수금",
          quantity: 1,
          avgPriceUsd: 63788,
          avgPriceKrw: 88027944,
          currentPriceUsd: 63788,
          currentPriceKrw: 88027944,
          return1D: 0,
          return1W: 0,
          return1M: 0,
          return1Y: 0,
        },
      ]);
    }

    if (savedHistory) {
      try {
        const parsedH = JSON.parse(savedHistory).map((h: any) => ({
          date: String(h.date || ""),
          totalValueKrw: Number(h.totalValueKrw) || 0,
          totalPrincipalKrw: Number(h.totalPrincipalKrw) || 0,
        }));
        setHistory(parsedH);
      } catch {
        setHistory([]);
      }
    } else {
      setHistory([
        { date: "2026.08.01", totalValueKrw: 215000000, totalPrincipalKrw: 200000000 },
        { date: "2026.09.01", totalValueKrw: 228000000, totalPrincipalKrw: 210000000 },
        { date: "2026.10.01", totalValueKrw: 244734955, totalPrincipalKrw: 244734955 },
      ]);
    }

    if (savedGoal) setGoal(Number(savedGoal) || 10000000000);
    if (savedWeights) setTargetWeights(JSON.parse(savedWeights));
    if (savedYest) setYesterdayValue(Number(savedYest) || 0);

    fetch("/api/fx")
      .then((res) => res.json())
      .then((data) => data.rate && setUsdToKrw(Number(data.rate)))
      .catch(() => {});
    fetchGlobalIndices();

    setIsLoaded(true);
  }, []);

  // --- 로컬 스토리지 자동 저장 ---
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("vr_portfolio_assets", JSON.stringify(assets));
      localStorage.setItem("vr_portfolio_history_v2", JSON.stringify(history));
      localStorage.setItem("vr_portfolio_goal", goal.toString());
      localStorage.setItem("vr_portfolio_weights", JSON.stringify(targetWeights));
      localStorage.setItem("vr_portfolio_yesterday", yesterdayValue.toString());
    }
  }, [assets, history, goal, targetWeights, yesterdayValue, isLoaded]);

  // --- 매달 1일 접속 시 총 자산 자동 스냅샷 기록 ---
  useEffect(() => {
    if (!isLoaded || assets.length === 0) return;
    const today = new Date();
    if (today.getDate() === 1) {
      const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.01`;
      const totalValKrw = assets.reduce((sum, a) => sum + a.quantity * a.currentPriceKrw, 0);
      const totalPrinKrw = assets.reduce((sum, a) => sum + a.quantity * a.avgPriceKrw, 0);
      if (totalValKrw <= 0) return;

      setHistory((prev) => {
        const exists = prev.some((h) => h.date === dateStr);
        if (exists) return prev;
        return [...prev, { date: dateStr, totalValueKrw: Math.round(totalValKrw), totalPrincipalKrw: Math.round(totalPrinKrw) }].sort(
          (a, b) => a.date.localeCompare(b.date)
        );
      });
    }
  }, [assets, isLoaded]);

  if (!isLoaded) return <div className="flex items-center justify-center min-h-screen font-bold">인프라 금융망 연동 중...</div>;

  // --- 핵심 지표 연산 ---
  const totalInvestmentKrw = assets.reduce((sum, a) => sum + a.quantity * a.avgPriceKrw, 0);
  const totalValueKrw = assets.reduce((sum, a) => sum + a.quantity * a.currentPriceKrw, 0);

  const totalInvestment = assets.reduce(
    (sum, a) => sum + (currency === "USD" ? a.quantity * a.avgPriceUsd : a.quantity * a.avgPriceKrw),
    0
  );
  const totalValue = assets.reduce(
    (sum, a) => sum + (currency === "USD" ? a.quantity * a.currentPriceUsd : a.quantity * a.currentPriceKrw),
    0
  );
  const totalProfit = totalValue - totalInvestment;
  const totalProfitRate = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
  const goalProgress = (totalValue / (getDisplayPrice(goal) || 1)) * 100;
  const dailyReturn =
    yesterdayValue > 0 ? ((totalValue - getDisplayPrice(yesterdayValue)) / getDisplayPrice(yesterdayValue)) * 100 : 0;

  // --- 평가액 기준 vs 원금 기준 카테고리 맵 동시 계산 ---
  const currentCategoryMap = assets.reduce((acc, a) => {
    const val = currency === "USD" ? a.quantity * a.currentPriceUsd : a.quantity * a.currentPriceKrw;
    acc[a.category] = (acc[a.category] || 0) + val;
    return acc;
  }, {} as Record<string, number>);

  const principalCategoryMap = assets.reduce((acc, a) => {
    const val = currency === "USD" ? a.quantity * a.avgPriceUsd : a.quantity * a.avgPriceKrw;
    acc[a.category] = (acc[a.category] || 0) + val;
    return acc;
  }, {} as Record<string, number>);

  const currentPieData = Object.keys(currentCategoryMap)
    .map((key) => ({ name: key, value: currentCategoryMap[key] }))
    .filter((d) => d.value > 0);

  const principalPieData = Object.keys(principalCategoryMap)
    .map((key) => ({ name: key, value: principalCategoryMap[key] }))
    .filter((d) => d.value > 0);

  // --- 자산군 비중 도넛 차트 커스텀 툴팁 (개별 종목의 총 자산 대비 % 표시) ---
  const CustomPieTooltip = ({ active, payload, mode }: any) => {
    if (!active || !payload || !payload.length) return null;
    const categoryName = payload[0].name;
    const categoryVal = Number(payload[0].value) || 0;
    const baseTotal = mode === "current" ? totalValue : totalInvestment;
    const categoryShare = baseTotal > 0 ? (categoryVal / baseTotal) * 100 : 0;

    const categoryAssets = assets
      .filter((a) => a.category === categoryName)
      .map((a) => {
        const val =
          mode === "current"
            ? currency === "USD"
              ? a.quantity * a.currentPriceUsd
              : a.quantity * a.currentPriceKrw
            : currency === "USD"
            ? a.quantity * a.avgPriceUsd
            : a.quantity * a.avgPriceKrw;
        const shareOfTotalPortfolio = baseTotal > 0 ? (val / baseTotal) * 100 : 0;
        return { name: a.name, val, shareOfTotalPortfolio };
      })
      .filter((item) => item.val > 0)
      .sort((a, b) => b.val - a.val);

    return (
      <div className="bg-slate-900/95 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[230px] z-50">
        <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
          <span className="font-extrabold text-sm text-blue-400">{categoryName}</span>
          <span className="font-bold">
            {categoryShare.toFixed(1)}% ({formatCurrency(categoryVal)})
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-1.5 font-semibold">
          내 총 자산({mode === "current" ? "평가액" : "원금"}) 대비 종목별 비중:
        </p>
        <div className="space-y-1">
          {categoryAssets.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center gap-3">
              <span className="font-bold text-slate-100">• {item.name}</span>
              <span className="font-mono text-emerald-400 font-bold">
                {item.shareOfTotalPortfolio.toFixed(1)}%{" "}
                <span className="text-slate-400 font-normal">({formatCurrency(item.val)})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- 히트맵 데이터 (선택한 기간 반영) ---
  const getAssetReturnByPeriod = (a: Asset, period: HeatmapPeriod): number => {
    if (a.category === "현금") return 0;
    if (period === "1D") return Number(a.return1D) || 0;
    if (period === "1W") return Number(a.return1W) || 0;
    if (period === "1M") return Number(a.return1M) || 0;
    if (period === "1Y") return Number(a.return1Y) || 0;
    return a.avgPriceKrw > 0 ? ((a.currentPriceKrw - a.avgPriceKrw) / a.avgPriceKrw) * 100 : 0;
  };

  const treeMapData = assets
    .map((a) => {
      const size = currency === "USD" ? a.quantity * a.currentPriceUsd : a.quantity * a.currentPriceKrw;
      const profitRate = getAssetReturnByPeriod(a, heatmapPeriod);
      return { name: a.name, size: size > 0 ? size : 0, profitRate };
    })
    .filter((a) => a.size > 0);

  // --- 월별 1일 자산 기록 관리 함수 ---
  const recordCurrentMonthAsset = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.01`;
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.date !== dateStr);
      return [
        ...filtered,
        {
          date: dateStr,
          totalValueKrw: Math.round(totalValueKrw),
          totalPrincipalKrw: Math.round(totalInvestmentKrw),
        },
      ].sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  const handleManualHistoryAdd = () => {
    if (!manualDate.trim()) return;
    const valKrw = Number(manualValueKrw) || Math.round(totalValueKrw);
    const prinKrw = Number(manualPrincipalKrw) || Math.round(totalInvestmentKrw);
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.date !== manualDate.trim());
      return [...filtered, { date: manualDate.trim(), totalValueKrw: valKrw, totalPrincipalKrw: prinKrw }].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    });
    setManualValueKrw("");
    setManualPrincipalKrw("");
  };

  const removeHistoryItem = (dateStr: string) => {
    setHistory((prev) => prev.filter((h) => h.date !== dateStr));
  };

  const chartHistoryData = history.map((h) => ({
    date: h.date,
    평가금액: Number(getDisplayPrice(h.totalValueKrw).toFixed(2)),
    투자원금: Number(getDisplayPrice(h.totalPrincipalKrw).toFixed(2)),
  }));

  const handleTextImport = () => {
    if (!importText.trim()) return;
    const lines = importText.trim().split("\n");
    const newAssets: Asset[] = [];
    lines.forEach((line, index) => {
      const parts = line
        .split(/[\t,]+| +(?=\d)/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 3) {
        const name = parts[0];
        const qty = parseFloat(parts[1].replace(/,/g, ""));
        const priceUsd = parseFloat(parts[2].replace(/,/g, ""));
        if (!isNaN(qty) && !isNaN(priceUsd)) {
          newAssets.push({
            id: Date.now().toString() + index,
            category: "미국주식",
            name,
            quantity: qty,
            avgPriceUsd: priceUsd,
            avgPriceKrw: priceUsd * usdToKrw,
            currentPriceUsd: priceUsd,
            currentPriceKrw: priceUsd * usdToKrw,
            return1D: 0,
            return1W: 0,
            return1M: 0,
            return1Y: 0,
          });
        }
      }
    });
    if (newAssets.length > 0) {
      setAssets([...assets, ...newAssets]);
      setImportText("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800 pb-20">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* 상단 헤더 & 우측 현재 시세 새로고침 버튼 */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Portfolio & VR Master Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              실시간 자산 배분 계측 및 거시지표 자동 동기화 시스템 (최근 갱신: {lastUpdated})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchAllPrices}
              disabled={isRefreshing}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-extrabold text-white shadow-sm transition-all ${
                isRefreshing ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
              }`}
            >
              <span>{isRefreshing ? "⟳ 실시간 시세 동기화 중..." : "↻ 현재 시세 새로고침"}</span>
            </button>
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
              <span className="text-xs font-bold text-slate-500 px-2">통화 기준</span>
              <select
                className="border border-slate-300 p-1.5 rounded-lg text-sm font-bold bg-slate-50 text-slate-700 focus:outline-none"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "KRW" | "USD")}
              >
                <option value="KRW">KRW (₩)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
        </header>

        {/* 요약 카드 4종 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
            <p className="text-slate-500 text-sm font-medium mb-2">총 평가 금액</p>
            <h2 className="text-3xl font-black text-slate-900">{formatCurrency(totalValue)}</h2>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
            <p className="text-slate-500 text-sm font-medium mb-2">총 투자 원금</p>
            <h2 className="text-3xl font-bold text-slate-700">{formatCurrency(totalInvestment)}</h2>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
            <p className="text-slate-500 text-sm font-medium mb-2">총 평가 수익</p>
            <h2 className={`text-3xl font-black ${totalProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {totalProfit >= 0 ? "+" : ""}
              {formatCurrency(totalProfit)}
            </h2>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
            <div className="flex justify-between items-center mb-2">
              <p className="text-slate-500 text-sm font-medium">목표 자산 달성률</p>
              <input
                type="number"
                className="text-right text-xs border-b border-slate-300 w-24 focus:outline-none font-bold"
                value={goal}
                onChange={(e) => setGoal(Number(e.target.value))}
              />
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${Math.min(goalProgress, 100)}%` }} />
            </div>
            <p className="text-right font-black text-blue-600 text-sm">
              {goalProgress.toFixed(2)}% (목표: {formatCurrency(getDisplayPrice(goal))})
            </p>
          </div>
        </div>

        {/* 일일 성과 및 거시지표 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h3 className="text-lg font-bold text-slate-800">일일 성과 및 거시지표 자동 모니터링</h3>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 p-2 rounded-lg border">
              <span>실시간 동기화 환율: 1$ = ₩{usdToKrw.toFixed(2)}</span>
              <span className="mx-1">|</span>
              <label>어제 자산 총액(₩) 기입:</label>
              <input
                type="number"
                className="border border-slate-300 px-2 py-0.5 rounded text-sm w-32 font-bold focus:outline-none"
                value={yesterdayValue}
                onChange={(e) => setYesterdayValue(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-inner">
              <p className="text-xs font-extrabold text-blue-800 uppercase tracking-wider mb-1">내 포트폴리오 성과</p>
              <div className="space-y-0.5">
                <p className={`text-xl font-black ${dailyReturn >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  일간: {dailyReturn >= 0 ? "+" : ""}
                  {dailyReturn.toFixed(2)}%
                </p>
                <p className={`text-xs font-bold ${totalProfitRate >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  누적: {totalProfitRate >= 0 ? "+" : ""}
                  {totalProfitRate.toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">NASDAQ Composite</p>
              <p className={`text-xl font-black ${marketIndices.nasdaq.daily >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                일간: {marketIndices.nasdaq.daily >= 0 ? "+" : ""}
                {marketIndices.nasdaq.daily.toFixed(2)}%
              </p>
              <p className={`text-xs font-semibold ${marketIndices.nasdaq.yearly >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                연간: {marketIndices.nasdaq.yearly >= 0 ? "+" : ""}
                {marketIndices.nasdaq.yearly.toFixed(2)}%
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">S&P 500 Index</p>
              <p className={`text-xl font-black ${marketIndices.snp.daily >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                일간: {marketIndices.snp.daily >= 0 ? "+" : ""}
                {marketIndices.snp.daily.toFixed(2)}%
              </p>
              <p className={`text-xs font-semibold ${marketIndices.snp.yearly >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                연간: {marketIndices.snp.yearly >= 0 ? "+" : ""}
                {marketIndices.snp.yearly.toFixed(2)}%
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">KOSPI Index</p>
              <p className={`text-xl font-black ${marketIndices.kospi.daily >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                일간: {marketIndices.kospi.daily >= 0 ? "+" : ""}
                {marketIndices.kospi.daily.toFixed(2)}%
              </p>
              <p className={`text-xs font-semibold ${marketIndices.kospi.yearly >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                연간: {marketIndices.kospi.yearly >= 0 ? "+" : ""}
                {marketIndices.kospi.yearly.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* 히트맵 (일/주/월/연 선택) & 자산군 비중 (평가액/원금 동시 표시 + 호버 시 종목별 비중) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 포트폴리오 히트맵 */}
          <div className="lg:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 h-[460px] flex flex-col">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <h3 className="text-lg font-bold text-slate-800">포트폴리오 히트맵</h3>
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                {(
                  [
                    { key: "1D", label: "일단위" },
                    { key: "1W", label: "주단위" },
                    { key: "1M", label: "월단위" },
                    { key: "1Y", label: "연단위" },
                    { key: "TOTAL", label: "평단대비" },
                  ] as { key: HeatmapPeriod; label: string }[]
                ).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setHeatmapPeriod(item.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      heatmapPeriod === item.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 w-full relative">
              {treeMapData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap data={treeMapData} dataKey="size" aspectRatio={4 / 3} stroke="#fff" content={<CustomTreemapContent />} />
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">데이터가 없습니다.</div>
              )}
            </div>
          </div>

          {/* 자산군 비중 그래프 (평가액 기준 + 원금 기준 동시 표시) */}
          <div className="lg:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col h-[460px]">
            <div className="mb-2">
              <h3 className="text-lg font-bold text-slate-800">자산군 Allocation 비중 (평가액 vs 원금)</h3>
              <p className="text-xs text-slate-500">
                각 영역에 커서를 올리면 해당 자산군 내 개별 종목이 <strong>내 총 자산 중 몇 %</strong>인지 표시됩니다.
              </p>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[340px]">
              {/* 1. 평가액 기준 도넛 */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-3 py-1 rounded-full mb-1">
                  평가액 기준 비중
                </span>
                <div className="w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={currentPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                        label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {currentPieData.map((entry, index) => (
                          <Cell key={`cell-cur-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={(props: any) => <CustomPieTooltip {...props} mode="current" />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 2. 원금 기준 도넛 */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-extrabold text-slate-700 bg-slate-100 px-3 py-1 rounded-full mb-1">
                  원금 기준 비중
                </span>
                <div className="w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={principalPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                        label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {principalPieData.map((entry, index) => (
                          <Cell key={`cell-prin-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={(props: any) => <CustomPieTooltip {...props} mode="principal" />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 매달 1일 총 자산 변화 추이 그래프 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">월별 총 자산 변화 추이 (매달 1일 기준)</h3>
              <p className="text-xs text-slate-500">
                매달 1일 접속 시 총 자산이 자동 기록되며, 우측 버튼으로 이번 달 1일 기록을 즉시 갱신하거나 과거 월 데이터를 추가할 수 있습니다.
              </p>
            </div>
            <button
              onClick={recordCurrentMonthAsset}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-colors"
            >
              📌 현재 자산으로 이번 달 1일 기록 저장/갱신
            </button>
          </div>

          <div className="h-[300px] w-full">
            {chartHistoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartHistoryData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={(val: any) => (currency === "USD" ? `$${formatNum(val)}` : `₩${formatNum(val / 10000)}만`)}
                  />
                  <RechartsTooltip formatter={(value: any, name: any) => [formatCurrency(value), String(name)]} />
                  <Legend />
                  <Area type="monotone" dataKey="평가금액" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  <Area type="monotone" dataKey="투자원금" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">기록된 월별 데이터가 없습니다.</div>
            )}
          </div>

          {/* 월별 데이터 수동 입력 및 관리 바 */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">월별 기록 직접 추가:</span>
              <input
                type="text"
                placeholder="2026.11.01"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 w-28 font-mono font-bold bg-white"
              />
              <input
                type="number"
                placeholder="총 평가액(₩, 미입력시 현재값)"
                value={manualValueKrw}
                onChange={(e) => setManualValueKrw(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 w-48 font-mono bg-white"
              />
              <input
                type="number"
                placeholder="총 원금(₩, 미입력시 현재값)"
                value={manualPrincipalKrw}
                onChange={(e) => setManualPrincipalKrw(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 w-44 font-mono bg-white"
              />
              <button
                onClick={handleManualHistoryAdd}
                className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
              >
                + 기록 반영
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {history.map((h) => (
                <span
                  key={h.date}
                  className="inline-flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1 rounded-md text-xs font-mono text-slate-700"
                >
                  {h.date}
                  <button
                    onClick={() => removeHistoryItem(h.date)}
                    className="text-slate-400 hover:text-rose-500 font-bold ml-1"
                    title="기록 삭제"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 목표 비중 리밸런싱 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-1">목표 비중 리밸런싱 (Value Rebalancing)</h3>
          <p className="text-xs text-slate-500 mb-4">설정한 목표 비중에 도달하기 위해 필요한 자산 자금의 매수/매도 액션을 계측합니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">자산군 (Category)</th>
                  <th className="py-3 px-4">현재 비중 (평가액 기준)</th>
                  <th className="py-3 px-4 w-32">목표 비중(%)</th>
                  <th className="py-3 px-4 text-right">필요 액션 (현재 선택 통화 기준)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {["가상자산", "미국주식", "국내주식", "현금"].map((cat) => {
                  const currentAmount = currentCategoryMap[cat] || 0;
                  const currentWeight = totalValue > 0 ? (currentAmount / totalValue) * 100 : 0;
                  const targetW = targetWeights[cat] || 0;
                  const targetAmount = totalValue * (targetW / 100);
                  const diff = targetAmount - currentAmount;

                  return (
                    <tr key={cat} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800">{cat}</td>
                      <td className="py-3 px-4 text-slate-600">{currentWeight.toFixed(1)}%</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          className="border border-slate-300 px-2 py-1.5 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold"
                          value={targetW}
                          onChange={(e) => updateTargetWeight(cat, e.target.value)}
                        />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-black tracking-tight ${
                          diff > 0 ? "text-blue-600" : diff < 0 ? "text-red-500" : "text-slate-400"
                        }`}
                      >
                        {diff !== 0 ? `${diff > 0 ? "매수 " : "매도 "} ${formatCurrency(Math.abs(diff))}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 보유 종목 데이터베이스 관리 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">보유 종목 데이터베이스 관리</h3>
            <button
              onClick={() => setIsImportOpen(!isImportOpen)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg"
            >
              {isImportOpen ? "가져오기 패널 닫기 ▲" : "대량 가져오기 패널 열기 ▼"}
            </button>
          </div>

          {isImportOpen && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
              <p className="text-xs text-slate-500 mb-2 font-medium">
                한 줄에 한 종목씩 <strong>종목명, 수량, 달러평단가</strong> 순으로 입력하세요.
              </p>
              <textarea
                className="w-full h-32 p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono"
                placeholder={"AAPL, 30, 175\nIREN 100 45"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div className="flex justify-end mt-3 gap-2">
                <button
                  onClick={() => setImportText("")}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  초기화
                </button>
                <button
                  onClick={handleTextImport}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  종목 일괄 삽입
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-slate-600">
              자산 레코드 관리 테이블 <span className="text-xs font-normal text-slate-400">(현금 선택 시 매수 평단가는 입력 불필요하며 보유액만 입력)</span>
            </h4>
            <div className="flex gap-2">
              <button
                onClick={fetchAllPrices}
                disabled={isRefreshing}
                className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
              >
                ↻ 전체 시세 & 거시지표 갱신
              </button>
              <button
                onClick={addAsset}
                className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
              >
                + 단일 자산 추가
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-600 uppercase font-semibold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-3">분류</th>
                  <th className="py-3 px-3">종목명</th>
                  <th className="py-3 px-3">수량</th>
                  <th className="py-3 px-3">매수 평단가 ($)</th>
                  <th className="py-3 px-3">매수 평단가 (₩)</th>
                  <th className="py-3 px-3">현재 시세 / 현금 보유액 ($)</th>
                  <th className="py-3 px-3">현재 시세 / 현금 보유액 (₩)</th>
                  <th className="py-3 px-3">수익률 ($)</th>
                  <th className="py-3 px-3">수익률 (₩)</th>
                  <th className="py-3 px-3 text-center">갱신/삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {assets.map((a) => {
                  const isCash = a.category === "현금";
                  const profitRateUsd = !isCash && a.avgPriceUsd > 0 ? ((a.currentPriceUsd - a.avgPriceUsd) / a.avgPriceUsd) * 100 : 0;
                  const profitRateKrw = !isCash && a.avgPriceKrw > 0 ? ((a.currentPriceKrw - a.avgPriceKrw) / a.avgPriceKrw) * 100 : 0;

                  return (
                    <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-2">
                        <select
                          className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-medium text-slate-700"
                          value={a.category}
                          onChange={(e) => updateAsset(a.id, "category", e.target.value)}
                        >
                          <option value="가상자산">가상자산</option>
                          <option value="미국주식">미국주식</option>
                          <option value="국내주식">국내주식</option>
                          <option value="현금">현금</option>
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-bold w-28"
                          value={a.name}
                          onChange={(e) => updateAsset(a.id, "name", e.target.value)}
                          placeholder={isCash ? "예수금 명칭" : "TQQQ"}
                        />
                      </td>
                      <td className="py-2 px-2">
                        {isCash ? (
                          <span className="inline-block px-2 py-1.5 text-slate-400 font-mono">1 (고정)</span>
                        ) : (
                          <input
                            type="number"
                            className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono w-20"
                            value={a.quantity}
                            onChange={(e) => updateAsset(a.id, "quantity", e.target.value)}
                          />
                        )}
                      </td>
                      {/* 현금일 경우 매수 평단가 입력 불필요 처리 */}
                      <td className="py-2 px-2">
                        {isCash ? (
                          <span className="inline-block bg-slate-100 text-slate-400 px-2.5 py-1.5 rounded font-semibold">
                            입력 불필요
                          </span>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            className="border border-blue-200 bg-blue-50/30 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono font-bold text-blue-700 w-28"
                            value={a.avgPriceUsd}
                            onChange={(e) => updateAsset(a.id, "avgPriceUsd", e.target.value)}
                          />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isCash ? (
                          <span className="inline-block bg-slate-100 text-slate-400 px-2.5 py-1.5 rounded font-semibold">
                            입력 불필요
                          </span>
                        ) : (
                          <input
                            type="number"
                            className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono text-slate-600 w-32"
                            value={Math.round(a.avgPriceKrw)}
                            onChange={(e) => updateAsset(a.id, "avgPriceKrw", e.target.value)}
                          />
                        )}
                      </td>
                      {/* 현금일 경우 현재 보유액을 직접 입력 가능 */}
                      <td className="py-2 px-2 font-mono text-slate-700 font-semibold">
                        {isCash ? (
                          <input
                            type="number"
                            step="0.01"
                            className="border border-emerald-300 bg-emerald-50/30 rounded px-2 py-1.5 outline-none focus:border-emerald-600 font-mono font-bold text-emerald-700 w-28"
                            value={Math.round(a.currentPriceUsd * 100) / 100}
                            onChange={(e) => updateAsset(a.id, "currentPriceUsd", e.target.value)}
                            placeholder="달러 보유액"
                          />
                        ) : (
                          `$${formatNum(a.currentPriceUsd)}`
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700 font-semibold">
                        {isCash ? (
                          <input
                            type="number"
                            className="border border-emerald-300 bg-emerald-50/30 rounded px-2 py-1.5 outline-none focus:border-emerald-600 font-mono font-bold text-emerald-700 w-32"
                            value={Math.round(a.currentPriceKrw)}
                            onChange={(e) => updateAsset(a.id, "currentPriceKrw", e.target.value)}
                            placeholder="원화 보유액"
                          />
                        ) : (
                          `₩${formatNum(Math.round(a.currentPriceKrw))}`
                        )}
                      </td>
                      <td className={`py-2 px-2 font-bold ${profitRateUsd >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {isCash ? "0.00%" : `${profitRateUsd >= 0 ? "+" : ""}${profitRateUsd.toFixed(2)}%`}
                      </td>
                      <td className={`py-2 px-2 font-bold ${profitRateKrw >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {isCash ? "0.00%" : `${profitRateKrw >= 0 ? "+" : ""}${profitRateKrw.toFixed(2)}%`}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!isCash && (
                            <button
                              onClick={() => fetchCurrentPrice(a.id, a.category, a.name, usdToKrw)}
                              className="bg-slate-200 hover:bg-blue-100 text-slate-600 hover:text-blue-600 p-1.5 rounded transition-colors"
                              title="시세 동기화"
                            >
                              ↻
                            </button>
                          )}
                          <button
                            onClick={() => removeAsset(a.id)}
                            className="text-slate-300 hover:text-red-500 font-bold text-md transition-colors"
                            title="종목 삭제"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}