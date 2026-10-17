import type { Asset } from './portfolio-types';

export function revalueAsset(asset: Asset, rate: number): Asset {
  if (!Number.isFinite(rate) || rate <= 0) return asset;
  if (asset.category === '미국주식' || asset.category === '가상자산') {
    return { ...asset, currentPriceKrw: asset.currentPriceUsd * rate };
  }
  if (asset.category === '국내주식') return { ...asset, currentPriceUsd: asset.currentPriceKrw / rate };
  if (asset.category === '현금') {
    const usd = asset.cashCurrency === 'USD' || (!asset.cashCurrency && asset.currentPriceKrw === 0 && asset.currentPriceUsd > 0);
    const krw = usd ? asset.currentPriceUsd * rate : asset.currentPriceKrw;
    const dollars = usd ? asset.currentPriceUsd : asset.currentPriceKrw / rate;
    return { ...asset, quantity: 1, currentPriceKrw: krw, currentPriceUsd: dollars, avgPriceKrw: krw, avgPriceUsd: dollars };
  }
  return asset;
}

export function editAsset(asset: Asset, field: keyof Asset, value: string | number, rate: number): Asset {
  const updated = { ...asset, [field]: value } as Asset;
  if (['quantity', 'avgPriceUsd', 'avgPriceKrw', 'currentPriceUsd', 'currentPriceKrw'].includes(field)) {
    const numeric = Number(value);
    Object.assign(updated, { [field]: Number.isFinite(numeric) ? numeric : 0 });
  }
  if (field === 'category' && value === '현금') {
    updated.cashCurrency = 'KRW';
    updated.currentPriceKrw = asset.quantity * asset.currentPriceKrw;
    updated.currentPriceUsd = asset.quantity * asset.currentPriceUsd;
    updated.quantity = 1;
    updated.return1D = updated.return1W = updated.return1M = updated.return1Y = 0;
  }
  if (updated.category === '현금') {
    if (field === 'currentPriceUsd') updated.cashCurrency = 'USD';
    if (field === 'currentPriceKrw') updated.cashCurrency = 'KRW';
    return revalueAsset(updated, rate);
  }
  // Initialize a missing counterpart for a new asset; never overwrite an existing acquisition cost.
  if (field === 'avgPriceUsd' && asset.avgPriceKrw === 0) updated.avgPriceKrw = updated.avgPriceUsd * rate;
  if (field === 'avgPriceKrw' && asset.avgPriceUsd === 0) updated.avgPriceUsd = updated.avgPriceKrw / rate;
  return updated;
}

export function assetReturn(asset: Asset, currency: 'KRW' | 'USD'): number {
  const cost = currency === 'KRW' ? asset.avgPriceKrw : asset.avgPriceUsd;
  const price = currency === 'KRW' ? asset.currentPriceKrw : asset.currentPriceUsd;
  return asset.category !== '현금' && cost > 0 ? (price - cost) / cost * 100 : 0;
}

export type AssetSort = 'registered' | 'value' | 'return-desc' | 'return-asc' | 'name';
export function selectAssets(assets: Asset[], query: string, category: string, sort: AssetSort, currency: 'KRW' | 'USD'): Asset[] {
  const keyword = query.trim().toLocaleLowerCase('ko-KR');
  const selected = assets.filter(asset => (category === '전체' || asset.category === category)
    && (!keyword || asset.name.toLocaleLowerCase('ko-KR').includes(keyword)));
  const value = (asset: Asset) => asset.quantity * (currency === 'KRW' ? asset.currentPriceKrw : asset.currentPriceUsd);
  if (sort === 'value') selected.sort((a, b) => value(b) - value(a));
  if (sort === 'return-desc') selected.sort((a, b) => assetReturn(b, currency) - assetReturn(a, currency));
  if (sort === 'return-asc') selected.sort((a, b) => assetReturn(a, currency) - assetReturn(b, currency));
  if (sort === 'name') selected.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
  return selected;
}
