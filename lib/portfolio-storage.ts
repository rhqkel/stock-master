export const fields = {
  assets: 'vr_portfolio_assets', history: 'vr_portfolio_history_v2',
  goal: 'vr_portfolio_goal', targetWeights: 'vr_portfolio_weights',
  rebalanceEnabled: 'vr_portfolio_rebal_enabled', yesterdayValue: 'vr_portfolio_yesterday',
  usdToKrw: 'vr_portfolio_fx_rate',
} as const;

export type PortfolioData = Record<keyof typeof fields, unknown>;
export const emptyPortfolio: PortfolioData = {
  assets: [], history: [], goal: 100000000, targetWeights: {},
  rebalanceEnabled: { '가상자산': true, '미국주식': true, '국내주식': true, '현금': true },
  yesterdayValue: 0, usdToKrw: 1380,
};

export function validPortfolio(value: unknown): value is PortfolioData {
  if (!value || typeof value !== 'object') return false;
  const p = value as PortfolioData;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  const numericMap = (v: unknown, kind: 'number' | 'boolean') => !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v).every(n => kind === 'number' ? finite(n) : typeof n === 'boolean');
  return Array.isArray(p.assets) && p.assets.every(a => a && typeof a === 'object'
    && ['id', 'category', 'name'].every(k => typeof a[k] === 'string')
    && ['quantity', 'avgPriceUsd', 'avgPriceKrw', 'currentPriceUsd', 'currentPriceKrw'].every(k => finite(a[k])))
    && Array.isArray(p.history) && p.history.every(h => h && typeof h.date === 'string' && finite(h.totalValueKrw) && finite(h.totalPrincipalKrw))
    && typeof p.goal === 'number' && Number.isFinite(p.goal)
    && typeof p.usdToKrw === 'number' && p.usdToKrw > 0
    && finite(p.yesterdayValue)
    && numericMap(p.targetWeights, 'number') && numericMap(p.rebalanceEnabled, 'boolean');
}

export function readLocal(prefix = ''): PortfolioData {
  const result = { ...emptyPortfolio };
  for (const [field, key] of Object.entries(fields)) {
    const raw = localStorage.getItem(prefix + key);
    if (raw !== null) result[field as keyof PortfolioData] = JSON.parse(raw);
  }
  return result;
}

export function writeLocal(prefix: string, data: PortfolioData) {
  if (!validPortfolio(data)) throw new Error('저장된 자산 데이터 형식을 확인해주세요.');
  for (const [field, key] of Object.entries(fields)) {
    localStorage.setItem(prefix + key, JSON.stringify(data[field as keyof PortfolioData]));
  }
}
