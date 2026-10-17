"use client";

import React, { useState, useEffect, useRef } from "react";
import { validPortfolio, validChange } from '@/lib/portfolio-storage';
import type { Asset, MonthlyHistory, PortfolioState, PortfolioData, ChangeEntry } from '@/lib/portfolio-types';
import { appendChange } from '@/lib/portfolio-history';
import DashboardSection, { DashboardNavigation, sections } from './dashboard-section';
import ChangeHistory from './change-history';
import { revalueAsset, editAsset, selectAssets, type AssetSort } from '@/lib/asset-calculations';
import { AmountPrivacy, PrivateNumberInput } from './amount-privacy';
export type { Asset } from '@/lib/portfolio-types';
import MobileAssetCards from './mobile-asset-cards';
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

const ALL_CATEGORIES = ["가상자산", "미국주식", "국내주식", "현금"];
const PIE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

// --- 히트맵 커스텀 렌더러 ---
const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, name, profitRate } = props;
  if (!width || !height) return null;

  const safeRate = typeof profitRate === "number" && !isNaN(profitRate) ? profitRate : 0;
  let bgColor = "#64748b";
  if (safeRate >= 5) bgColor = "#059669";
  else if (safeRate > 0) bgColor = "#10b981";
  else if (safeRate <= -5) bgColor = "#e11d48";
  else if (safeRate < 0) bgColor = "#ef4444";

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

export default function PortfolioDashboard({ storagePrefix = "", onSnapshot }: { storagePrefix?: string; onSnapshot?: (data: PortfolioData) => void }) {
  const snapshotCallback = useRef(onSnapshot);
  useEffect(() => { snapshotCallback.current = onSnapshot; }, [onSnapshot]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = useState<MonthlyHistory[]>([]);
  const [goal, setGoal] = useState<number>(10000000000);
  const [targetWeights, setTargetWeights] = useState<Record<string, number>>({});
  const [rebalanceEnabled, setRebalanceEnabled] = useState<Record<string, boolean>>({
    "가상자산": true,
    "미국주식": true,
    "국내주식": true,
    "현금": true,
  });

  const [yesterdayValue, setYesterdayValue] = useState<number>(0);
  const [usdToKrw, setUsdToKrw] = useState<number>(1380);
  const [fxSource, setFxSource] = useState<string>("ExchangeRate-API / Yahoo Finance");
  const [fxTimestamp, setFxTimestamp] = useState<string>("-");
  const [priceTimestamp, setPriceTimestamp] = useState<string>("-");

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
  const [isFxRefreshing, setIsFxRefreshing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetCategory, setAssetCategory] = useState('전체');
  const [assetSort, setAssetSort] = useState<AssetSort>('registered');
  const resetAssetFilters = () => { setSearchQuery(''); setAssetCategory('전체'); setAssetSort('registered'); };
  useEffect(() => { if (isLoaded) localStorage.setItem(storagePrefix + 'vr_portfolio_private', String(hideAmounts)); }, [hideAmounts, isLoaded, storagePrefix]);
  const [auditTrail, setAuditTrail] = useState<ChangeEntry[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const captureState = (): PortfolioState => ({ assets, history, goal, targetWeights, rebalanceEnabled, yesterdayValue, usdToKrw });
  const recordChange = (label: string, group = '') => {
    const before = captureState();
    setAuditTrail(previous => appendChange(previous, label, before, group));
  };
  const applyState = (state: PortfolioState) => {
    setAssets(state.assets); setHistory(state.history); setGoal(state.goal);
    setTargetWeights(state.targetWeights); setRebalanceEnabled(state.rebalanceEnabled);
    setYesterdayValue(state.yesterdayValue); setUsdToKrw(state.usdToKrw);
  };
  const restoreChange = (entry: ChangeEntry, confirm: boolean) => {
    if (confirm && !window.confirm(`‘${entry.label}’ 직전으로 복원할까요? 이후에 바꾼 자산·월별 기록·설정도 함께 되돌아갑니다. 복원 작업도 변경 이력에 남습니다.`)) return;
    recordChange(`‘${entry.label}’ 이전 상태로 복원`);
    applyState(structuredClone(entry.before));
  };
  const toggleSection = (id: string) => setCollapsedSections(previous => ({ ...previous, [id]: !previous[id] }));
  const navigateSection = (id: string) => {
    setCollapsedSections(previous => ({ ...previous, [id]: false }));
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      target?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    if (isLoaded) localStorage.setItem(storagePrefix + 'vr_portfolio_collapsed', JSON.stringify(collapsedSections));
  }, [collapsedSections, isLoaded, storagePrefix]);

  // JSON 파일 불러오기용 Ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 월별 자산 수동 추가 입력 상태
  const [manualDate, setManualDate] = useState<string>("");
  const [manualValueKrw, setManualValueKrw] = useState<string>("");
  const [manualPrincipalKrw, setManualPrincipalKrw] = useState<string>("");

  const formatKstDateTime = (isoOrDate: string | Date) => {
    try {
      const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "-";
    }
  };

  const getDisplayPrice = (priceInKrw: number) => {
    const val = Number(priceInKrw) || 0;
    return currency === "USD" ? val / usdToKrw : val;
  };

  const formatNum = (num: any) => {
    const val = Number(num);
    if (hideAmounts) return '••••';
    return isNaN(val) ? "0" : val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatCurrency = (num: any) => hideAmounts ? '••••' : (currency === "USD" ? `$${formatNum(num)}` : `₩${formatNum(num)}`);

  // --- 자산 업데이트 로직 ---
  const updateAsset = (id: string, field: keyof Asset, val: string | number) => {
    const asset = assets.find(item => item.id === id);
    if (!asset || String(asset[field]) === String(val)) return;
    const labels: Partial<Record<keyof Asset, string>> = { name: '이름', category: '분류', quantity: '수량', avgPriceUsd: '달러 평단가', avgPriceKrw: '원화 평단가', currentPriceUsd: '달러 보유액', currentPriceKrw: '원화 보유액', cashCurrency: '현금 기준 통화' };
    recordChange(`${asset.name || '자산'} ${labels[field] || field} 수정`, `asset:${id}:${field}`);
    setAssets(previous => previous.map(item => item.id === id ? editAsset(item, field, val, usdToKrw) : item));
  };

  const removeAsset = (id: string) => {
    const asset = assets.find(item => item.id === id);
    if (!asset) return;
    recordChange(`${asset.name || '자산'} 삭제`);
    setAssets(prev => prev.filter(item => item.id !== id));
  };

  const addAsset = () => {
    recordChange('자산 추가');
    resetAssetFilters();
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
  };

  const updateTargetWeight = (cat: string, val: string) => {
    recordChange(`${cat} 목표 비중 수정`, `weight:${cat}`);
    setTargetWeights((prev) => ({ ...prev, [cat]: Number(val) || 0 }));
  };

  const toggleRebalanceCategory = (cat: string) => {
    recordChange(`${cat} 리밸런싱 ${rebalanceEnabled[cat] !== false ? '제외' : '포함'}`);
    setRebalanceEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // --- 환율 적용 공통 헬퍼 함수 ---
  const applyNewExchangeRate = (newRate: number, sourceName: string, timeStr: string) => {
    setUsdToKrw(newRate);
    setFxSource(sourceName);
    setFxTimestamp(formatKstDateTime(timeStr));
    localStorage.setItem(storagePrefix + "vr_portfolio_fx_rate", newRate.toString());

    setAssets(previous => previous.map(asset => revalueAsset(asset, newRate)));
  };

  // --- 실시간 환율 동기화 (서버 API 호출 + 실패 시 클라이언트 직접 호출 이중 보장) ---
  const fetchExchangeRate = async (): Promise<number> => {
    setIsFxRefreshing(true);
    try {
      // 1단계: 자체 백엔드 라우트 호출 (캐시 무효화 타임스탬프 포함)
      try {
        const res = await fetch(`/api/fx?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const parsedRate = Number(data?.rate);
          if (parsedRate && parsedRate > 900 && parsedRate < 2500) {
            applyNewExchangeRate(
              parsedRate,
              data.source || "ExchangeRate-API",
              data.timestamp || new Date().toISOString()
            );
            return parsedRate;
          }
        }
      } catch (err) {
        console.warn("Backend /api/fx failed, switching to direct client fetch:", err);
      }

      // 2단계: 백엔드 라우트 실패/미배포 시 브라우저에서 직접 공개 환율 API 호출
      const directRes = await fetch(`https://open.er-api.com/v6/latest/USD?t=${Date.now()}`);
      if (directRes.ok) {
        const directData = await directRes.json();
        const directRate = Number(directData?.rates?.KRW);
        if (directRate && directRate > 900 && directRate < 2500) {
          applyNewExchangeRate(
            directRate,
            "ExchangeRate-API (Direct)",
            directData?.time_last_update_utc || new Date().toISOString()
          );
          return directRate;
        }
      }
    } catch (e) {
      console.error("환율 조회 최종 실패", e);
    } finally {
      setIsFxRefreshing(false);
    }
    return usdToKrw;
  };

  // --- 지수 및 개별 종목 시세 Fetch ---
  const fetchGlobalIndices = async () => {
    const tickers = { nasdaq: "^IXIC", snp: "^GSPC", kospi: "^KS11" };
    for (const [key, ticker] of Object.entries(tickers)) {
      try {
        const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}&t=${Date.now()}`, { cache: "no-store" });
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
      const response = await fetch(`/api/price?ticker=${encodeURIComponent(tickerToSearch)}&t=${Date.now()}`, {
        cache: "no-store",
      });
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
        if (data.marketTime) {
          setPriceTimestamp(formatKstDateTime(data.marketTime));
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
      const latestFx = await fetchExchangeRate();
      await fetchGlobalIndices();
      for (const asset of assets) {
        if (asset.category !== "현금") {
          await fetchCurrentPrice(asset.id, asset.category, asset.name, latestFx);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      setPriceTimestamp(formatKstDateTime(new Date()));
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- 3. JSON 데이터 파일 백업(내보내기) 및 복원(불러오기) 기능 ---
  const handleExportJson = () => {
    const backupPayload = {
      version: "3.0",
      exportedAt: new Date().toISOString(),
      assets,
      history,
      goal,
      targetWeights,
      rebalanceEnabled,
      yesterdayValue,
      usdToKrw,
      auditTrail,
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `portfolio_backup_${dateTag}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || "{}"));
        if (!validPortfolio(parsed)) throw new Error('Invalid backup');
        const combined = [...auditTrail, ...(parsed.auditTrail || [])]
          .filter((entry, index, all) => all.findIndex(item => item.id === entry.id) === index)
          .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 29);
        setAuditTrail(appendChange(combined, 'JSON 백업 불러오기', captureState()));
        applyState(parsed);
        alert("백업 파일(.json) 데이터가 성공적으로 복원되었습니다.");
      } catch (err) {
        alert("유효하지 않은 백업 파일 형식입니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // --- 초기 로드 ---
  useEffect(() => {
    const savedAssets = localStorage.getItem(storagePrefix + "vr_portfolio_assets");
    const savedHistory = localStorage.getItem(storagePrefix + "vr_portfolio_history_v2");
    const savedGoal = localStorage.getItem(storagePrefix + "vr_portfolio_goal");
    const savedWeights = localStorage.getItem(storagePrefix + "vr_portfolio_weights");
    const savedRebalEnabled = localStorage.getItem(storagePrefix + "vr_portfolio_rebal_enabled");
    const savedYest = localStorage.getItem(storagePrefix + "vr_portfolio_yesterday");
    const savedFx = localStorage.getItem(storagePrefix + "vr_portfolio_fx_rate");
    setHideAmounts(localStorage.getItem(storagePrefix + "vr_portfolio_private") === "true");
    try {
      const savedAudit = JSON.parse(localStorage.getItem(storagePrefix + 'vr_portfolio_audit_trail') || '[]');
      if (Array.isArray(savedAudit)) setAuditTrail(savedAudit.filter(validChange).slice(0, 30));
      const savedCollapsed = JSON.parse(localStorage.getItem(storagePrefix + 'vr_portfolio_collapsed') || '{}');
      if (savedCollapsed && typeof savedCollapsed === 'object' && !Array.isArray(savedCollapsed)) setCollapsedSections(savedCollapsed);
    } catch { /* Invalid view preferences do not block loading the portfolio. */ }

    if (savedFx && Number(savedFx) > 900) {
      setUsdToKrw(Number(savedFx));
    }

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
            cashCurrency: a.cashCurrency === "USD" || (!a.cashCurrency && curKrw === 0 && curUsd > 0) ? "USD" : "KRW",
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
      setAssets([]);
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
      setHistory([]);
    }

    if (savedGoal !== null && Number.isFinite(Number(savedGoal))) setGoal(Number(savedGoal));
    if (savedWeights) setTargetWeights(JSON.parse(savedWeights));
    if (savedRebalEnabled) {
      try {
        setRebalanceEnabled(JSON.parse(savedRebalEnabled));
      } catch {}
    }
    if (savedYest) setYesterdayValue(Number(savedYest) || 0);

    if (!storagePrefix) fetchExchangeRate();
    fetchGlobalIndices();

    setIsLoaded(true);
  }, []);

  // --- 로컬 스토리지 자동 저장 ---
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(storagePrefix + "vr_portfolio_assets", JSON.stringify(assets));
      localStorage.setItem(storagePrefix + "vr_portfolio_history_v2", JSON.stringify(history));
      localStorage.setItem(storagePrefix + "vr_portfolio_goal", goal.toString());
      localStorage.setItem(storagePrefix + "vr_portfolio_weights", JSON.stringify(targetWeights));
      localStorage.setItem(storagePrefix + "vr_portfolio_rebal_enabled", JSON.stringify(rebalanceEnabled));
      localStorage.setItem(storagePrefix + "vr_portfolio_yesterday", yesterdayValue.toString());
      localStorage.setItem(storagePrefix + 'vr_portfolio_audit_trail', JSON.stringify(auditTrail));
      localStorage.setItem(storagePrefix + 'vr_portfolio_fx_rate', usdToKrw.toString());
      snapshotCallback.current?.({ assets, history, goal, targetWeights, rebalanceEnabled, yesterdayValue, usdToKrw, auditTrail });
    }
  }, [assets, history, goal, targetWeights, rebalanceEnabled, yesterdayValue, usdToKrw, auditTrail, isLoaded, storagePrefix]);

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

  const visibleAssets = selectAssets(assets, searchQuery, assetCategory, assetSort, currency);

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

  // 내 포트폴리오 일간 성과 (어제 자산 기입 시 어제 대비, 미기입 시 보유 종목 가중평균 1D 수익률 자동 적용)
  const weightedDailyReturn =
    totalValueKrw > 0
      ? assets.reduce((sum, a) => {
          const weight = (a.quantity * a.currentPriceKrw) / totalValueKrw;
          const r1d = a.category === "현금" ? 0 : Number(a.return1D) || 0;
          return sum + weight * r1d;
        }, 0)
      : 0;

  const dailyReturn =
    yesterdayValue > 0
      ? ((totalValue - getDisplayPrice(yesterdayValue)) / getDisplayPrice(yesterdayValue)) * 100
      : weightedDailyReturn;

  // Reference only: current holdings weights × security 1Y price changes, without ownership dates or cash flows.
  const currentCompositionYearlyChange =
    totalValueKrw > 0
      ? assets.reduce((sum, a) => {
          const weight = (a.quantity * a.currentPriceKrw) / totalValueKrw;
          const r1y = a.category === "현금" ? 0 : Number(a.return1Y) || 0;
          return sum + weight * r1y;
        }, 0)
      : 0;

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

  // --- 자산군 비중 도넛 차트 커스텀 툴팁 ---
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

  // --- 히트맵 데이터 ---
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
    recordChange('이번 달 자산 기록 저장');
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
    recordChange(`${manualDate.trim()} 월별 기록 저장`);
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
    recordChange(`${dateStr} 월별 기록 삭제`);
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
      recordChange(`자산 ${newAssets.length}개 일괄 가져오기`);
      resetAssetFilters();
      setAssets([...assets, ...newAssets]);
      setImportText("");
    }
  };

  return (
    <AmountPrivacy.Provider value={hideAmounts}><div className="portfolio-dashboard min-h-screen min-w-0 bg-slate-50 p-4 md:p-8 font-sans text-slate-800 pb-16">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* 상단 헤더 & 백업/복원 & 시세 새로고침 버튼 */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Portfolio & VR Master Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              실시간 자산 배분 계측 및 거시지표 자동 동기화 시스템
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="privacy-toggle" aria-pressed={hideAmounts} onClick={() => setHideAmounts(value => !value)}>{hideAmounts ? '◉ 금액 표시' : '◎ 금액 숨기기'}</button>
            {/* JSON 백업 내보내기 & 불러오기 버튼 */}
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-extrabold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 shadow-sm transition-all active:scale-95"
              title="현재 모든 자산 데이터를 JSON 파일로 기기에 저장합니다"
            >
              💾 데이터 백업(.json)
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-extrabold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 shadow-sm transition-all active:scale-95"
              title="백업해둔 JSON 파일을 불러와 데이터를 복원합니다"
            >
              📂 백업 불러오기
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJson}
              accept=".json,application/json"
              className="hidden"
            />

            {/* 현재 시세 새로고침 버튼 */}
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

        <DashboardNavigation onNavigate={navigateSection} onSetAll={collapsed => setCollapsedSections(Object.fromEntries(sections.map(([id]) => [id, collapsed])))} />
        {auditTrail.length > 0 && <div className="change-undo-bar" role="status"><span>최근 변경: {auditTrail[0].label}</span><button onClick={() => restoreChange(auditTrail[0], false)}>↶ 최근 변경 취소</button></div>}

        {/* 요약 카드 4종 */}
        <DashboardSection id="summary" title="자산 요약" collapsed={!!collapsedSections.summary} onToggle={() => toggleSection("summary")} className="summary-section">
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
              <PrivateNumberInput

                className="text-right text-xs border-b border-slate-300 w-24 focus:outline-none font-bold"
                value={goal}
                onChange={(e) => { recordChange('목표 자산 수정', 'goal'); setGoal(Number(e.target.value)); }}
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
</DashboardSection>

        {/* 평가액 증감과 종목 가격 등락 참고 지표 */}
        <DashboardSection id="performance" title="성과 및 거시지표" collapsed={!!collapsedSections['performance']} onToggle={() => toggleSection('performance')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-lg border">
              <span className="text-blue-700 font-bold">
                실시간 환율: 1$ = ₩{usdToKrw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <button
                onClick={() => fetchExchangeRate()}
                disabled={isFxRefreshing}
                className={`border px-2.5 py-1 rounded text-[11px] font-extrabold transition-all ${
                  isFxRefreshing
                    ? "bg-slate-200 text-slate-500 border-slate-300 cursor-wait"
                    : "bg-white border-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-slate-700 active:scale-95"
                }`}
                title="실시간 환율 즉시 갱신"
              >
                {isFxRefreshing ? "⟳ 갱신중..." : "↻ 환율갱신"}
              </button>
              <span className="mx-1 text-slate-300">|</span>
              <label>어제 자산 총액(₩) 기입:</label>
              <PrivateNumberInput

                className="border border-slate-300 px-2 py-0.5 rounded text-sm w-32 font-bold focus:outline-none bg-white"
                value={yesterdayValue}
                onChange={(e) => { recordChange('어제 자산 총액 수정', 'yesterday'); setYesterdayValue(Number(e.target.value)); }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Reference price changes are distinct from actual account returns. */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-inner">
              <p className="text-xs font-extrabold text-blue-800 uppercase tracking-wider mb-1">내 자산 증감 · 참고 지표</p>
              <div className="space-y-0.5">
                <p className={`text-xl font-black ${dailyReturn >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {yesterdayValue > 0 ? "어제 자산 대비 증감" : "현재 구성 일간 등락(참고)"}: {dailyReturn >= 0 ? "+" : ""}
                  {dailyReturn.toFixed(2)}%
                </p>
                <p className={`text-xs font-bold ${currentCompositionYearlyChange >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  현재 구성 1년 등락(참고): {currentCompositionYearlyChange >= 0 ? "+" : ""}
                  {currentCompositionYearlyChange.toFixed(2)}%{" "}
                  <span className="text-[11px] text-slate-500 font-semibold">
                    (평단 대비: {totalProfitRate >= 0 ? "+" : ""}
                    {totalProfitRate.toFixed(1)}%)
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed pt-2">현재 구성 등락은 종목별 가격 등락의 현재 비중 가중평균이며, 매수 시점·입출금·배당·환율 변화는 반영하지 않습니다. 실제 연간 수익률은 거래 기록이 필요합니다. 어제 대비 증감에는 입출금도 포함됩니다.</p>
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
        </DashboardSection>

        {/* 히트맵 & 자산군 비중 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <DashboardSection id="heatmap" title="포트폴리오 히트맵" collapsed={!!collapsedSections['heatmap']} onToggle={() => toggleSection('heatmap')} className="lg:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 h-[460px] flex flex-col">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">

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
          </DashboardSection>

          <DashboardSection id="allocation" title="자산군 비중" collapsed={!!collapsedSections['allocation']} onToggle={() => toggleSection('allocation')} className="lg:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col h-[560px] sm:h-[500px]">
            <div className="mb-2">

              <p className="text-xs text-slate-500">
                각 영역에 커서를 올리면 해당 자산군 내 개별 종목이 <strong>내 총 자산 중 몇 %</strong>인지 표시됩니다.
              </p>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[340px]">
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
          </DashboardSection>
        </div>

        {/* 매달 1일 총 자산 변화 추이 그래프 */}
        <DashboardSection id="trend" title="월별 자산 추이" collapsed={!!collapsedSections['trend']} onToggle={() => toggleSection('trend')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>

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
              <PrivateNumberInput

                placeholder="총 평가액(₩, 미입력시 현재값)"
                value={manualValueKrw}
                onChange={(e) => setManualValueKrw(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 w-48 font-mono bg-white"
              />
              <PrivateNumberInput

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
        </DashboardSection>

        {/* 목표 비중 리밸런싱 */}
        <DashboardSection id="rebalance" title="목표 비중 리밸런싱" collapsed={!!collapsedSections['rebalance']} onToggle={() => toggleSection('rebalance')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <div>

              <p className="text-xs text-slate-500">
                좌측 체크박스를 선택한 자산군만 선명하게 활성화되며, 체크 해제 시 어둡게 음영 처리되어 리밸런싱 계산에서 제외됩니다.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
              활성 목표 비중 합계:{" "}
              <strong className="text-blue-600">
                {ALL_CATEGORIES.reduce((sum, c) => sum + (rebalanceEnabled[c] !== false ? targetWeights[c] || 0 : 0), 0)}%
              </strong>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-20 text-center">리밸런싱</th>
                  <th className="py-3 px-4">자산군 (Category)</th>
                  <th className="py-3 px-4">현재 비중 (평가액 기준)</th>
                  <th className="py-3 px-4 w-36">목표 비중(%)</th>
                  <th className="py-3 px-4 text-right">필요 액션 (현재 선택 통화 기준)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ALL_CATEGORIES.map((cat) => {
                  const isChecked = rebalanceEnabled[cat] !== false;
                  const currentAmount = currentCategoryMap[cat] || 0;
                  const currentWeight = totalValue > 0 ? (currentAmount / totalValue) * 100 : 0;
                  const targetW = targetWeights[cat] || 0;
                  const targetAmount = totalValue * (targetW / 100);
                  const diff = targetAmount - currentAmount;

                  return (
                    <tr
                      key={cat}
                      className={`transition-all duration-200 ${
                        isChecked
                          ? "bg-white hover:bg-blue-50/30 text-slate-900 font-medium"
                          : "bg-slate-200/75 opacity-40 text-slate-400 select-none"
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRebalanceCategory(cat)}
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                        />
                      </td>
                      <td className={`py-3 px-4 font-bold ${isChecked ? "text-slate-900" : "text-slate-500 line-through"}`}>
                        {cat}
                      </td>
                      <td className="py-3 px-4">{currentWeight.toFixed(1)}%</td>
                      <td className="py-3 px-4">
                        <input type="number"

                          disabled={!isChecked}
                          className={`border px-2.5 py-1.5 rounded-lg w-full outline-none transition-all font-bold ${
                            isChecked
                              ? "border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                              : "border-slate-300 bg-slate-200 text-slate-400 cursor-not-allowed"
                          }`}
                          value={targetW}
                          onChange={(e) => updateTargetWeight(cat, e.target.value)}
                        />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-black tracking-tight ${
                          !isChecked
                            ? "text-slate-400"
                            : diff > 0
                            ? "text-blue-600"
                            : diff < 0
                            ? "text-rose-500"
                            : "text-slate-400"
                        }`}
                      >
                        {!isChecked
                          ? "리밸런싱 제외"
                          : diff !== 0
                          ? `${diff > 0 ? "매수 " : "매도 "} ${formatCurrency(Math.abs(diff))}`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DashboardSection>

        {/* 보유 종목 데이터베이스 관리 */}
        <DashboardSection id="asset-manager" title="보유 종목 관리" collapsed={!!collapsedSections['asset-manager']} onToggle={() => toggleSection('asset-manager')} className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col min-w-0">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">

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
                value={hideAmounts ? "금액을 표시한 뒤 가져오기를 사용할 수 있습니다." : importText}
                disabled={hideAmounts}
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

          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
            <h4 className="text-sm font-bold text-slate-600">
              내 자산 {assets.length}개 중 {visibleAssets.length}개 표시{" "}
              <span className="text-xs font-normal text-slate-400">
                (현금 선택 시 매수 평단가는 입력 불필요하며 보유액만 입력)
              </span>
            </h4>
            <div className="flex gap-2 asset-manager-buttons">
              <button
                onClick={fetchAllPrices}
                disabled={isRefreshing}
                className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
              >
                ↻ 전체 시세 & 환율 갱신
              </button>
              <button
                onClick={addAsset}
                className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
              >
                + 자산 추가
              </button>
            </div>
          </div>

          <div className="asset-search-controls">
            <label>종목 검색<input type="search" placeholder="종목명 또는 티커" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></label>
            <label>자산 분류<select value={assetCategory} onChange={event => setAssetCategory(event.target.value)}>{['전체', ...ALL_CATEGORIES].map(category => <option key={category}>{category}</option>)}</select></label>
            <label>정렬<select value={assetSort} onChange={event => setAssetSort(event.target.value as AssetSort)}><option value="registered">등록순</option><option value="value">평가금액 큰 순</option><option value="return-desc">수익률 높은 순</option><option value="return-asc">수익률 낮은 순</option><option value="name">이름순</option></select></label>
            <button onClick={resetAssetFilters}>초기화</button>
          </div>
          <p className="asset-controls-note">검색·정렬은 이 목록에만 적용됩니다. 전체 자산 합계와 차트는 바뀌지 않습니다. 평단가는 매수 당시 금액을 입력하세요. 환율 갱신으로 바뀌지 않습니다.</p>
          {hideAmounts && <p className="asset-controls-note" role="status">금액·수량을 숨겼습니다. 금액을 표시하면 다시 수정할 수 있습니다.</p>}
          {visibleAssets.length === 0 && assets.length > 0 && <p className="mobile-assets-empty">검색 조건에 맞는 자산이 없어요.</p>}
          <div className="md:hidden">{(visibleAssets.length > 0 || assets.length === 0) && <MobileAssetCards assets={visibleAssets} currency={currency} onUpdate={updateAsset}
            onRemove={removeAsset} refreshing={isRefreshing}
            onRefresh={asset => { void fetchCurrentPrice(asset.id, asset.category, asset.name, usdToKrw); }} />}</div>
          <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto rounded-lg border border-slate-200">
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
                {visibleAssets.map((a) => {
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
                        {isCash && <select aria-label="현금 기준 통화" value={a.cashCurrency || 'KRW'} onChange={event => updateAsset(a.id, 'cashCurrency', event.target.value)} className="block mt-2 border rounded p-1.5"><option value="KRW">원화 기준</option><option value="USD">달러 기준</option></select>}
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
                          <PrivateNumberInput

                            className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono w-20"
                            value={a.quantity}
                            onChange={(e) => updateAsset(a.id, "quantity", e.target.value)}
                          />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isCash ? (
                          <span className="inline-block bg-slate-100 text-slate-400 px-2.5 py-1.5 rounded font-semibold">
                            입력 불필요
                          </span>
                        ) : (
                          <PrivateNumberInput

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
                          <PrivateNumberInput

                            className="bg-transparent border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 font-mono text-slate-600 w-32"
                            value={Math.round(a.avgPriceKrw)}
                            onChange={(e) => updateAsset(a.id, "avgPriceKrw", e.target.value)}
                          />
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700 font-semibold">
                        {isCash ? (
                          <PrivateNumberInput

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
                          <PrivateNumberInput

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

          {/* 테이블 하단 시세 출처 및 기준 시각 안내 */}
          <div className="mt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center text-[11px] text-slate-400 gap-1 px-1">
            <span>
              * 현재 시세 출처: <strong>Yahoo Finance API</strong> (미국주식: NASDAQ/NYSE, 국내주식: KRX, 가상자산: CoinMarketCap/Yahoo) | 기준 시각:{" "}
              <strong>{priceTimestamp} (KST)</strong>
            </span>
            <span>
              * 환율 출처: <strong>{fxSource}</strong> | 환율 기준 시각: <strong>{fxTimestamp} (KST)</strong>
            </span>
          </div>
        </DashboardSection>

        <DashboardSection id="changes" title="삭제 취소 및 변경 이력" collapsed={!!collapsedSections.changes} onToggle={() => toggleSection('changes')} className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/60 shadow-sm"><ChangeHistory entries={auditTrail} onRestore={restoreChange} /></DashboardSection>

        {/* 페이지 최하단 글로벌 데이터 출처 및 기준 시각 푸터 */}
        <footer className="text-center text-[11px] text-slate-400 pt-4 pb-8 border-t border-slate-200/80 space-y-1">
          <p>
            시세 및 지수 데이터 제공: <strong>Yahoo Finance (query1.finance.yahoo.com)</strong> · 실시간 환율 제공:{" "}
            <strong>{fxSource}</strong>
          </p>
          <p>
            최종 시세 동기화 기준: <strong>{priceTimestamp} KST</strong> | 최종 환율 동기화 기준: <strong>{fxTimestamp} KST</strong> (거래소별 최대 15분 지연 시세가 포함될 수 있습니다.)
          </p>
        </footer>
      </div>
    </div></AmountPrivacy.Provider>
  );
}
