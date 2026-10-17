"use client";

import type { Asset } from './portfolio-dashboard';

type Props = {
  assets: Asset[];
  currency: 'KRW' | 'USD';
  onUpdate: (id: string, field: keyof Asset, value: string | number) => void;
  onRefresh: (asset: Asset) => void;
  onRemove: (id: string) => void;
  refreshing: boolean;
};

const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export default function MobileAssetCards({ assets, currency, onUpdate, onRefresh, onRemove, refreshing }: Props) {
  if (!assets.length) return <div className="mobile-assets-empty">아직 등록한 자산이 없어요.<br />위의 ‘자산 추가’로 첫 자산을 등록하세요.</div>;
  return <div className="mobile-asset-list">
    {assets.map(asset => {
      const cash = asset.category === '현금';
      const price = currency === 'USD' ? asset.currentPriceUsd : asset.currentPriceKrw;
      const average = currency === 'USD' ? asset.avgPriceUsd : asset.avgPriceKrw;
      const value = price * asset.quantity;
      const profit = (price - average) * asset.quantity;
      const rate = !cash && average > 0 ? (price - average) / average * 100 : 0;
      const money = (v: number) => `${currency === 'USD' ? '$' : '₩'}${number(v)}`;
      const input = (field: keyof Asset, label: string) => <label key={field}>{label}<input
        type="number" inputMode="decimal" step="any" min="0" value={Number(asset[field]) || 0}
        onChange={event => onUpdate(asset.id, field, event.target.value)} /></label>;
      return <article className="mobile-asset-card" key={asset.id} aria-label={`${asset.name} 자산`}>
        <div className="mobile-asset-heading"><div><span className="mobile-category">{asset.category}</span><h4>{asset.name || '이름 없는 자산'}</h4></div>
          <span className="mobile-asset-quantity">{cash ? '현금' : `${number(asset.quantity)} 보유`}</span></div>
        <p className="mobile-asset-value">{money(value)}</p>
        <p className={profit >= 0 ? 'mobile-profit-positive' : 'mobile-profit-negative'}>{cash ? '현금 보유액' : `평단 대비 ${profit >= 0 ? '+' : ''}${money(profit)} (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)`}</p>
        {!cash && <p className="mobile-asset-price">현재가 {money(price)} · 평단가 {money(average)}</p>}
        <details className="mobile-asset-edit"><summary>자산 정보 수정 <span aria-hidden="true">⌄</span></summary>
          <div className="mobile-asset-fields">
            <label>자산 분류<select value={asset.category} onChange={e => onUpdate(asset.id, 'category', e.target.value)}>
              {['가상자산', '미국주식', '국내주식', '현금'].map(category => <option key={category}>{category}</option>)}
            </select></label>
            <label>종목명 / 현금 명칭<input value={asset.name} autoCapitalize="characters" onChange={e => onUpdate(asset.id, 'name', e.target.value)} /></label>
            {cash ? <>{input('currentPriceKrw', '현금 보유액 (원)')}{input('currentPriceUsd', '현금 보유액 (달러)')}</> : <>
              {input('quantity', '보유 수량')}{input('avgPriceKrw', '매수 평단가 (원)')}{input('avgPriceUsd', '매수 평단가 (달러)')}
            </>}
          </div><p className="mobile-asset-hint">수정한 내용은 자동 저장됩니다.</p>
        </details>
        <div className="mobile-asset-actions">
          {!cash && <button disabled={refreshing} onClick={() => onRefresh(asset)}>↻ 시세 갱신</button>}
          <button className="mobile-asset-delete" onClick={() => {
            if (window.confirm(`${asset.name || '이 자산'}을 삭제할까요? 삭제 후에는 변경 이력에서 되돌릴 수 있습니다.`)) onRemove(asset.id);
          }}>자산 삭제</button>
        </div>
      </article>;
    })}
  </div>;
}
