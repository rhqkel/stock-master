export interface Asset {
  id: string;
  category: string;
  name: string;
  quantity: number;
  avgPriceUsd: number;
  avgPriceKrw: number;
  currentPriceUsd: number;
  currentPriceKrw: number;
  cashCurrency?: 'KRW' | 'USD';
  return1D?: number;
  return1W?: number;
  return1M?: number;
  return1Y?: number;
}

export interface MonthlyHistory {
  date: string;
  totalValueKrw: number;
  totalPrincipalKrw: number;
}

export interface PortfolioState {
  assets: Asset[];
  history: MonthlyHistory[];
  goal: number;
  targetWeights: Record<string, number>;
  rebalanceEnabled: Record<string, boolean>;
  yesterdayValue: number;
  usdToKrw: number;
}

export interface ChangeEntry {
  id: string;
  at: string;
  label: string;
  group: string;
  before: PortfolioState;
}

export type PortfolioData = PortfolioState & { auditTrail?: ChangeEntry[] };
