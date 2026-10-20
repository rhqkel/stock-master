import type { Asset } from './portfolio-types';

export const rebalanceKey = (asset: Asset) => `asset:${asset.id}`;

// Convert legacy category preferences once, preserving exclusions and category target totals.
export function migrateRebalance(assets: Asset[], weights: Record<string, number>, enabled: Record<string, boolean>) {
  const targetWeights: Record<string, number> = {};
  const rebalanceEnabled: Record<string, boolean> = {};
  for (const category of new Set(assets.map(asset => asset.category))) {
    const members = assets.filter(asset => asset.category === category);
    const missing = members.filter(asset => weights[rebalanceKey(asset)] === undefined);
    const assigned = members.reduce((sum, asset) => sum + (weights[rebalanceKey(asset)] || 0), 0);
    let remaining = Math.max(0, (weights[category] || 0) - assigned);
    let basis = missing.reduce((sum, asset) => sum + Math.max(0, asset.quantity * asset.currentPriceKrw), 0);
    missing.forEach((asset, index) => {
      const value = Math.max(0, asset.quantity * asset.currentPriceKrw);
      const share = basis > 0 ? value / basis : 1 / (missing.length - index);
      const weight = index === missing.length - 1 ? remaining : Math.round(remaining * share * 100) / 100;
      targetWeights[rebalanceKey(asset)] = Math.round(weight * 100) / 100;
      remaining -= weight;
      basis -= value;
    });
    for (const asset of members) {
      const key = rebalanceKey(asset);
      targetWeights[key] = weights[key] ?? targetWeights[key] ?? 0;
      rebalanceEnabled[key] = enabled[key] ?? enabled[category] ?? true;
    }
  }
  return { targetWeights, rebalanceEnabled };
}

export function calculateRebalance(assets: Asset[], weights: Record<string, number>, enabled: Record<string, boolean>, currency: 'KRW' | 'USD') {
  const selectedAssets = assets.filter(asset => enabled[rebalanceKey(asset)] !== false);
  const value = (asset: Asset) => asset.quantity * (currency === 'USD' ? asset.currentPriceUsd : asset.currentPriceKrw);
  const total = selectedAssets.reduce((sum, asset) => sum + value(asset), 0);
  const targetTotal = selectedAssets.reduce((sum, asset) => sum + (weights[rebalanceKey(asset)] || 0), 0);
  const rows = assets.map(asset => {
    const key = rebalanceKey(asset);
    const checked = enabled[key] !== false;
    const amount = value(asset);
    const target = weights[key] || 0;
    return { asset, key, checked, amount, target,
      currentWeight: checked && total > 0 ? amount / total * 100 : 0,
      difference: checked && total > 0 ? total * target / 100 - amount : 0 };
  });
  return { selectedAssets, total, targetTotal, rows };
}
