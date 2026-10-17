"use client";

import type { ReactNode } from 'react';

export const sections = [
  ['summary', '요약'], ['performance', '성과'], ['heatmap', '히트맵'], ['allocation', '비중'],
  ['trend', '자산 추이'], ['rebalance', '리밸런싱'], ['asset-manager', '보유 자산'], ['changes', '변경 이력'],
] as const;

export function DashboardNavigation({ onNavigate, onSetAll }: { onNavigate: (id: string) => void; onSetAll: (collapsed: boolean) => void }) {
  return <nav className="dashboard-navigation" aria-label="대시보드 바로가기">
    <div className="dashboard-navigation-links">{sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => onNavigate(id)}>{label}</a>)}</div>
    <div className="dashboard-navigation-controls"><button onClick={() => onSetAll(false)}>모두 펼치기</button><button onClick={() => onSetAll(true)}>모두 접기</button></div>
  </nav>;
}

export default function DashboardSection({ id, title, collapsed, onToggle, className = '', children }: {
  id: string; title: string; collapsed: boolean; onToggle: () => void; className?: string; children: ReactNode;
}) {
  return <section id={id} tabIndex={-1} className={`dashboard-section ${collapsed ? 'is-collapsed' : ''} ${className}`} aria-labelledby={`${id}-heading`}>
    <div className="dashboard-section-heading"><h2 id={`${id}-heading`}>{title}</h2><button aria-expanded={!collapsed} aria-controls={`${id}-content`} onClick={onToggle} aria-label={`${title} ${collapsed ? '펼치기' : '접기'}`}>{collapsed ? '펼치기 ＋' : '접기 −'}</button></div>
    <div id={`${id}-content`} hidden={collapsed} className="dashboard-section-content">{!collapsed && children}</div>
  </section>;
}
