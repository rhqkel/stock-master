"use client";

import React, { useState, useEffect, useRef } from "react";
import { PieChart, Pie, Cell, Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

// --- 1. 금융 데이터 인터페이스 정의 (통화 이원화) ---
interface Asset {
  id: string;
  category: string;
  name: string;
  quantity: number;
  avgPriceUsd: number;
  avgPriceKrw: number;
  currentPriceUsd: number;
  currentPriceKrw: number;
}

interface HistoryData {
  date: string;
  portfolio: number;
  nasdaq: number;
  snp: number;
  kospi: number;
}

interface IndexState {
  daily: number;
  yearly: number;
}

const KOR_STOCK_DICT: Record<string, string> = {
  "삼성전자": "005930",
  "SK하이닉스": "000660",
  "현대차": "005380",
  "NAVER": "035420",
  "카카오": "035720"
};

const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, name, profitRate } = props;
  if (!width || !height) return null;

  const safeRate = typeof profitRate === "number" ? profitRate : 0;
  let bgColor = "#94a3b8"; 
  if (safeRate > 20) bgColor = "#059669";
  else if (safeRate > 0) bgColor = "#10b981";
  else if (safeRate < -20) bgColor = "#e11d48";
  else if (safeRate < 0) bgColor = "#ef4444";

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={bgColor} stroke="#ffffff" strokeWidth={2} rx={4} ry={4} />
      {width > 50 && height > 40 && <text x={x + width / 2} y={y + height / 2 - 8} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold">{name}</text>}
      {width > 50 && height > 60 && <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" fill="#fff" fontSize={11}>{safeRate >= 0 ? "+" : ""}{safeRate.toFixed(2)}%</text>}
    </g>
  );
};

export default function PortfolioDashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [goal, setGoal] = useState<number>(10000000000); 
  const [targetWeights, setTargetWeights] = useState<Record<string, number>>({});
  
  const [yesterdayValue, setYesterdayValue] = useState<number>(0);
  const [usdToKrw, setUsdToKrw] = useState<number>(1380); 
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [pieMode, setPieMode] = useState<"current" | "principal">("current");
  
  const [marketIndices, setMarketIndices] = useState<Record<string, IndexState>>({
    nasdaq: { daily: 0, yearly: 0 },
    snp: { daily: 0, yearly: 0 },
    kospi: { daily: 0, yearly: 0 }
  });

  const [importText, setImportText] = useState("");
  const [activeTab, setActiveTab] = useState<"csv" | "image">("csv");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 과거 데이터 마이그레이션 및 undefined 방어 로직 추가
  const getDisplayPrice = (priceInKrw: number) => {
    const val = Number(priceInKrw) || 0;
    return currency === "USD" ? val / usdToKrw : val;
  };

  const updateAsset = (id: string, field: keyof Asset, val: string | number) => {
    setAssets(prev => prev.map((a) => {
      if (a.id !== id) return a;
      const updated = { ...a, [field]: val };
      
      if (field === "avgPriceUsd") updated.avgPriceKrw = Number(val) * usdToKrw;
      if (field === "avgPriceKrw") updated.avgPriceUsd = Number(val) / usdToKrw;
      
      if (["quantity", "avgPriceUsd", "avgPriceKrw", "currentPriceUsd", "currentPriceKrw"].includes(field)) {
        updated[field] = Number(val) || 0;
      }
      
      return updated;
    }));
  };

  const removeAsset = (id: string) => setAssets(prev => prev.filter((a) => a.id !== id));
  const addAsset = () => setAssets(prev => [...prev, { id: Date.now().toString(), category: "미국주식", name: "종목명", quantity: 0, avgPriceUsd: 0, avgPriceKrw: 0, currentPriceUsd: 0, currentPriceKrw: 0 }]);
  const updateTargetWeight = (cat: string, val: string) => setTargetWeights(prev => ({ ...prev, [cat]: Number(val) || 0 }));

  const fetchGlobalIndices = async () => {
    const tickers = { nasdaq: "^IXIC", snp: "^GSPC", kospi: "^KS11" };
    for (const [key, ticker] of Object.entries(tickers)) {
      try {
        const res = await fetch(`/api/price?ticker=${ticker}`);
        const data = await res.json();
        if (data.dailyReturn !== undefined && data.yearlyReturn !== undefined) {
          setMarketIndices(prev => ({ ...prev, [key]: { daily: Number(data.dailyReturn) || 0, yearly: Number(data.yearlyReturn) || 0 } }));
        }
      } catch (e) {
        console.error(`${key} 지수 갱신 실패`, e);
      }
    }
  };

  const fetchCurrentPrice = async (id: string, category: string, name: string) => {
    if (category === "현금" || !name || name === "종목명") return;
    let tickerToSearch = name;
    
    if (category === "가상자산" && !tickerToSearch.includes("-USD")) {
      tickerToSearch = `${tickerToSearch}-USD`; 
    } else if (category === "국내주식") {
      if (KOR_STOCK_DICT[name]) tickerToSearch = `${KOR_STOCK_DICT[name]}.KS`;
      else return;
    }

    try {
      const response = await fetch(`/api/price?ticker=${tickerToSearch}`);
      const data = await response.json();
      if (data.price) {
        let priceUsd = 0;
        let priceKrw = 0;
        if (category === "미국주식" || category === "가상자산") {
          priceUsd = Number(data.price) || 0;
          priceKrw = priceUsd * usdToKrw;
        } else if (category === "국내주식") {
          priceKrw = Number(data.price) || 0;
          priceUsd = priceKrw / usdToKrw;
        }
        setAssets(prev => prev.map(a => a.id === id ? { ...a, currentPriceUsd: priceUsd, currentPriceKrw: priceKrw } : a));
      }
    } catch (error) {
      console.error("가격 동기화 오류", error);
    }
  };

  const fetchAllPrices = async () => {
    await fetchGlobalIndices();
    for (const asset of assets) {
      if (asset.category !== "현금") {
        await fetchCurrentPrice(asset.id, asset.category, asset.name);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  };

  useEffect(() => {
    const savedAssets = localStorage.getItem("vr_portfolio_assets");
    const savedHistory = localStorage.getItem("vr_portfolio_history");
    const savedGoal = localStorage.getItem("vr_portfolio_goal");
    const savedWeights = localStorage.getItem("vr_portfolio_weights");
    const savedYest = localStorage.getItem("vr_portfolio_yesterday");

    if (savedAssets) {
      try {
        // 구형 데이터를 신형 데이터 규격으로 마이그레이션(undefined 방지)
        const parsed = JSON.parse(savedAssets).map((a: any) => ({
          id: a.id || Date.now().toString(),
          category: a.category || "현금",
          name: a.name || "",
          quantity: Number(a.quantity) || 0,
          avgPriceUsd: Number(a.avgPriceUsd) || 0,
          avgPriceKrw: Number(a.avgPriceKrw) || 0,
          currentPriceUsd: Number(a.currentPriceUsd) || 0,
          currentPriceKrw: Number(a.currentPriceKrw) || 0,
        }));
        setAssets(parsed);
      } catch (e) {
        console.error("로컬 스토리지 파싱 오류, 초기화 진행");
        setAssets([]);
      }
    } else {
      setAssets([
        { id: "1", category: "가상자산", name: "BTC", quantity: 1.317, avgPriceUsd: 66240, avgPriceKrw: 91413000, currentPriceUsd: 66240, currentPriceKrw: 91413000 },
        { id: "2", category: "미국주식", name: "IREN", quantity: 943, avgPriceUsd: 47.1, avgPriceKrw: 65000, currentPriceUsd: 47.1, currentPriceKrw: 65000 },
        { id: "3", category: "현금", name: "VR 예수금", quantity: 1, avgPriceUsd: 63788, avgPriceKrw: 88027944, currentPriceUsd: 63788, currentPriceKrw: 88027944 },
      ]);
    }
    
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    else setHistory([{ date: "26.01", portfolio: 0, nasdaq: 0, snp: 0, kospi: 0 }]);
    if (savedGoal) setGoal(Number(savedGoal) || 10000000000);
    if (savedWeights) setTargetWeights(JSON.parse(savedWeights));
    if (savedYest) setYesterdayValue(Number(savedYest) || 0);
    
    fetch('/api/fx').then(res => res.json()).then(data => data.rate && setUsdToKrw(Number(data.rate))).catch(() => {});
    fetchGlobalIndices();
    
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("vr_portfolio_assets", JSON.stringify(assets));
      localStorage.setItem("vr_portfolio_history", JSON.stringify(history));
      localStorage.setItem("vr_portfolio_goal", goal.toString());
      localStorage.setItem("vr_portfolio_weights", JSON.stringify(targetWeights));
      localStorage.setItem("vr_portfolio_yesterday", yesterdayValue.toString());
    }
  }, [assets, history, goal, targetWeights, yesterdayValue, isLoaded]);

  if (!isLoaded) return <div className="flex items-center justify-center min-h-screen font-bold">인프라 금융망 연동 중...</div>;

  const totalInvestment = assets.reduce((sum, a) => sum + (currency === "USD" ? a.quantity * a.avgPriceUsd : a.quantity * a.avgPriceKrw), 0);
  const totalValue = assets.reduce((sum, a) => sum + (currency === "USD" ? a.quantity * a.currentPriceUsd : a.quantity * a.currentPriceKrw), 0);
  const totalProfit = totalValue - totalInvestment;
  const totalProfitRate = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
  const goalProgress = (totalValue / (getDisplayPrice(goal) || 1)) * 100;
  const dailyReturn = yesterdayValue > 0 ? ((totalValue - getDisplayPrice(yesterdayValue)) / getDisplayPrice(yesterdayValue)) * 100 : 0;

  const categoryMap = assets.reduce((acc, a) => {
    let val = 0;
    if (pieMode === "current") {
      val = currency === "USD" ? a.quantity * a.currentPriceUsd : a.quantity * a.currentPriceKrw;
    } else {
      val = currency === "USD" ? a.quantity * a.avgPriceUsd : a.quantity * a.avgPriceKrw;
    }
    acc[a.category] = (acc[a.category] || 0) + val;
    return acc;
  }, {} as Record<string, number>);
  const categories = Object.keys(categoryMap);

  const treeMapData = assets.map((a) => {
    const size = currency === "USD" ? a.quantity * a.currentPriceUsd : a.quantity * a.currentPriceKrw;
    const profitRate = a.avgPriceKrw > 0 ? ((a.currentPriceKrw - a.avgPriceKrw) / a.avgPriceKrw) * 100 : 0;
    return { name: a.name, size: size > 0 ? size : 0, profitRate };
  }).filter((a) => a.size > 0);

  const pieData = categories.map((key) => ({ name: key, value: categoryMap[key] }));
  const PIE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

  // undefined를 0으로 캐스팅하는 안전한 Number Format 유틸
  const formatNum = (num: any) => {
    const val = Number(num);
    return isNaN(val) ? "0" : val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  const formatCurrency = (num: any) => currency === "USD" ? `$${formatNum(num)}` : `₩${formatNum(num)}`;

  const handleTextImport = () => {
    if (!importText.trim()) return;
    const lines = importText.trim().split('\n');
    const newAssets: Asset[] = [];
    lines.forEach((line, index) => {
      const parts = line.split(/[\t,]+| +(?=\d)/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const name = parts[0];
        const qty = parseFloat(parts[1].replace(/,/g, ''));
        const priceUsd = parseFloat(parts[2].replace(/,/g, ''));
        if (!isNaN(qty) && !isNaN(priceUsd)) {
          newAssets.push({ 
            id: Date.now().toString() + index, 
            category: "미국주식", 
            name, 
            quantity: qty, 
            avgPriceUsd: priceUsd, 
            avgPriceKrw: priceUsd * usdToKrw,
            currentPriceUsd: priceUsd,
            currentPriceKrw: priceUsd * usdToKrw
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
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Portfolio & VR Master Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">실시간 자산 배분 계측 및 거시지표 자동 동기화 시스템</p>
          </div>
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-500 px-2">통화 기준 일괄 전환</span>
            <select className="border border-slate-300 p-1.5 rounded-lg text-sm font-bold bg-slate-50 text-slate-700 focus:outline-none" value={currency} onChange={(e) => setCurrency(e.target.value as "KRW" | "USD")}>
              <option value="KRW">KRW (₩)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </header>

        {/* 요약 계측 위젯 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60"><p className="text-slate-500 text-sm font-medium mb-2">총 평가 금액</p><h2 className="text-3xl font-black text-slate-900">{formatCurrency(totalValue)}</h2></div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60"><p className="text-slate-500 text-sm font-medium mb-2">총 투자 원금</p><h2 className="text-3xl font-bold text-slate-700">{formatCurrency(totalInvestment)}</h2></div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60"><p className="text-slate-500 text-sm font-medium mb-2">총 평가 수익</p><h2 className={`text-3xl font-black ${totalProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{totalProfit >= 0 ? "+" : ""}{formatCurrency(totalProfit)}</h2></div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
            <div className="flex justify-between items-center mb-2"><p className="text-slate-500 text-sm font-medium">목표 자산 달성률</p><input type="number" className="text-right text-xs border-b border-slate-300 w-24 focus:outline-none font-bold" value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden"><div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${Math.min(goalProgress, 100)}%` }}></div></div>
            <p className="text-right font-black text-blue-600 text-sm">{goalProgress.toFixed(2)}% (목표: {formatCurrency(getDisplayPrice(goal))})</p>
          </div>
        </div>

        {/* 거시지표 자동 모니터링 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h3 className="text-lg font-bold text-slate-800">일일 성과 및 거시지표 자동 모니터링</h3>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 p-2 rounded-lg border">
              <span>실시간 동기화 환율: 1$ = ₩{usdToKrw.toFixed(2)}</span>
              <span className="mx-1">|</span>
              <label>어제 자산 총액 기입:</label>
              <input type="number" className="border border-slate-300 px-2 py-0.5 rounded text-sm w-32 font-bold focus:outline-none" value={yesterdayValue} onChange={(e) => setYesterdayValue(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-inner">
              <p className="text-xs font-extrabold text-blue-800 uppercase tracking-wider mb-1">내 포트폴리오 성과</p>
              <div className="space-y-0.5">
                <p className={`text-xl font-black ${dailyReturn >= 0 ? "text-emerald-600" : "text-rose-600"}`}>일간: {dailyReturn >= 0 ? "+" : ""}{dailyReturn.toFixed(2)}%</p>
                <p className={`text-xs font-bold ${totalProfitRate >= 0 ? "text-emerald-500" : "text-rose-500"}`}>누적: {totalProfitRate >= 0 ? "+" : ""}{totalProfitRate.toFixed(2)}%</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">NASDAQ Composite</p>
              <p className={`text-xl font-black ${marketIndices.nasdaq.daily >= 0 ? "text-emerald-600" : "text-rose-600"}`}>일간: {marketIndices.nasdaq.daily >= 0 ? "+" : ""}{marketIndices.nasdaq.daily.toFixed(2)}%</p>
              <p className={`text-xs font-semibold ${marketIndices.nasdaq.yearly >= 0 ? "text-emerald-500" : "text-rose-500"}`}>연간: {marketIndices.nasdaq.yearly >= 0 ? "+" : ""}{marketIndices.nasdaq.yearly.toFixed(2)}%</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">S&P 500 Index</p>
              <p className={`text-xl font-black ${marketIndices.snp.daily >= 0 ? "text-emerald-600" : "text-rose-600"}`}>일간: {marketIndices.snp.daily >= 0 ? "+" : ""}{marketIndices.snp.daily.toFixed(2)}%</p>
              <p className={`text-xs font-semibold ${marketIndices.snp.yearly >= 0 ? "text-emerald-500" : "text-rose-500"}`}>연간: {marketIndices.snp.yearly >= 0 ? "+" : ""}{marketIndices.snp.yearly.toFixed(2)}%</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">KOSPI Index</p>
              <p className={`text-xl font-black ${marketIndices.kospi.daily >= 0 ? "text-emerald-600" : "text-rose-600"}`}>일간: {marketIndices.kospi.daily >= 0 ? "+" : ""}{marketIndices.kospi.daily.toFixed(2)}%</p>
              <p className={`text-xs font-semibold ${marketIndices.kospi.yearly >= 0 ? "text-emerald-500" : "text-rose-500"}`}>연간: {marketIndices.kospi.yearly >= 0 ? "+" : ""}{marketIndices.kospi.yearly.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        {/* 시각화 도구 분할 트레이 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 h-[450px] flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-4">포트폴리오 히트맵</h3>
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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col h-[450px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-bold text-slate-800">자산군 Allocation 비중</h3>
              <select className="text-xs border rounded-lg p-1 font-semibold text-slate-600 focus:outline-none" value={pieMode} onChange={(e) => setPieMode(e.target.value as "current" | "principal")}>
                <option value="current">평가액 기준</option>
                <option value="principal">원금 기준</option>
              </select>
            </div>
            <div className="flex-1 min-h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3} label={({name, percent}) => `${name} (${(percent*100).toFixed(1)}%)`}>
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 리밸런싱 계산 엔진 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-1">목표 비중 리밸런싱 (Value Rebalancing)</h3>
          <p className="text-xs text-slate-500 mb-4">설정한 목표 비중에 도달하기 위해 필요한 자산 자금의 매수/매도 액션을 계측합니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">자산군 (Category)</th>
                  <th className="py-3 px-4">현재 비중</th>
                  <th className="py-3 px-4 w-32">목표 비중(%)</th>
                  <th className="py-3 px-4 text-right">필요 액션 (현재 선택 통화 기준)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {["가상자산", "미국주식", "국내주식", "현금"].map((cat) => {
                  const currentAmount = categoryMap[cat] || 0;
                  const currentWeight = totalValue > 0 ? (currentAmount / totalValue) * 100 : 0;
                  const targetW = targetWeights[cat] || 0;
                  const targetAmount = totalValue * (targetW / 100);
                  const diff = targetAmount - currentAmount;

                  return (
                    <tr key={cat} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800">{cat}</td>
                      <td className="py-3 px-4 text-slate-600">{currentWeight.toFixed(1)}%</td>
                      <td className="py-3 px-4">
                        <input type="number" className="border border-slate-300 px-2 py-1.5 rounded-lg w-full focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold" value={targetW} onChange={(e) => updateTargetWeight(cat, e.target.value)} />
                      </td>
                      <td className={`py-3 px-4 text-right font-black tracking-tight ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {diff !== 0 ? `${diff > 0 ? '매수 ' : '매도 '} ${formatCurrency(Math.abs(diff))}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 개별 종목 데이터베이스 관리 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">보유 종목 데이터베이스 관리</h3>
            <button onClick={() => setIsImportOpen(!isImportOpen)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg">
              {isImportOpen ? "가져오기 패널 닫기 ▲" : "대량 가져오기 패널 열기 ▼"}
            </button>
          </div>
          
          {isImportOpen && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
              <div className="flex gap-2 mb-4">
                <button onClick={() => setActiveTab("csv")} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === "csv" ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}>📄 CSV / 텍스트 붙여넣기</button>
                <button onClick={() => setActiveTab("image")} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === "image" ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}>🖼️ 스크린샷 인식</button>
              </div>
              {activeTab === "csv" ? (
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">한 줄에 한 종목씩 <strong>종목명, 수량, 달러평단가</strong> 순으로 입력하세요. (공백 파싱)</p>
                  <textarea className="w-full h-32 p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono" placeholder="AAPL, 30, 175&#13;&#10;IREN 100 45" value={importText} onChange={(e) => setImportText(e.target.value)} />
                  <div className="flex justify-end mt-3 gap-2">
                    <button onClick={() => setImportText("")} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">초기화</button>
                    <button onClick={handleTextImport} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">종목 일괄 삽입</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-300 rounded-lg bg-white">
                  <p className="text-sm text-slate-500 mb-4 font-medium">스크린샷 지원 중단 (텍스트 배포망을 사용하십시오)</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-slate-600">자산 레코드 관리 테이블</h4>
            <div className="flex gap-2">
              <button onClick={fetchAllPrices} className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm">↻ 전체 시세 & 거시지표 갱신</button>
              <button onClick={addAsset} className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm">+ 단일 자산 추가</button>
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
                  <th className="py-3 px-3">현재 시세 ($)</th>
                  <th className="py-3 px-3">현재 시세 (₩)</th>
                  <th className="py-3 px-3">수익률 ($)</th>
                  <th className="py-3 px-3">수익률 (₩)</th>
                  <th className="py-3 px-3 text-center">갱신/삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {assets.map((a) => {
                  const profitRateUsd = a.avgPriceUsd > 0 ? ((a.currentPriceUsd - a.avgPriceUsd) / a.avgPriceUsd) * 100 : 0;
                  const profitRateKrw = a.avgPriceKrw > 0 ? ((a.currentPriceKrw - a.avgPriceKrw) / a.avgPriceKrw) * 100 : 0;

                  return (
                    <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-2">
                        <select className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-medium text-slate-700" value={a.category} onChange={(e) => updateAsset(a.id, "category", e.target.value)}>
                          <option value="가상자산">가상자산</option>
                          <option value="미국주식">미국주식</option>
                          <option value="국내주식">국내주식</option>
                          <option value="현금">현금</option>
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-bold w-28" value={a.name} onChange={(e) => updateAsset(a.id, "name", e.target.value)} placeholder="TQQQ" />
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono w-20" value={a.quantity} onChange={(e) => updateAsset(a.id, "quantity", e.target.value)} />
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" step="0.01" className="bg-transparent border border-blue-200 bg-blue-50/30 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono font-bold text-blue-700 w-28" value={a.avgPriceUsd} onChange={(e) => updateAsset(a.id, "avgPriceUsd", e.target.value)} />
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono text-slate-600 w-32" value={Math.round(a.avgPriceKrw)} onChange={(e) => updateAsset(a.id, "avgPriceKrw", e.target.value)} />
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700 font-semibold">${formatNum(a.currentPriceUsd)}</td>
                      <td className="py-2 px-2 font-mono text-slate-700 font-semibold">₩{formatNum(Math.round(a.currentPriceKrw))}</td>
                      <td className={`py-2 px-2 font-bold ${profitRateUsd >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {profitRateUsd >= 0 ? "+" : ""}{profitRateUsd.toFixed(2)}%
                      </td>
                      <td className={`py-2 px-2 font-bold ${profitRateKrw >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {profitRateKrw >= 0 ? "+" : ""}{profitRateKrw.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => fetchCurrentPrice(a.id, a.category, a.name)} className="bg-slate-200 hover:bg-blue-100 text-slate-600 hover:text-blue-600 p-1.5 rounded transition-colors" title="시세 동기화">↻</button>
                          <button onClick={() => removeAsset(a.id)} className="text-slate-300 hover:text-red-500 font-bold text-md transition-colors">✕</button>
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