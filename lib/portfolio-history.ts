import type { ChangeEntry, PortfolioState } from './portfolio-types';

export const HISTORY_LIMIT = 30;

export function appendChange(trail: ChangeEntry[], label: string, before: PortfolioState, group = '', now = new Date()): ChangeEntry[] {
  const latest = trail[0];
  // Consecutive keystrokes in the same field share one restore point.
  if (group && latest?.group === group && now.getTime() - Date.parse(latest.at) < 2000) {
    return [{ ...latest, at: now.toISOString(), label }, ...trail.slice(1)];
  }
  const entry: ChangeEntry = { id: crypto.randomUUID(), at: now.toISOString(), label, group, before: structuredClone(before) };
  return [entry, ...trail].slice(0, HISTORY_LIMIT);
}
