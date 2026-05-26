// Lightweight localStorage — persists the active dataset between visits and the
// shared theme. No backend; all analysis runs client-side.

import type { Dataset } from './types';

const DATA_KEY = 'tools_dataset';
const THEME_KEY = 'syed-theme';

export function saveDataset(ds: Dataset): void {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(ds)); } catch { /* quota / ignore */ }
}
export function loadDataset(): Dataset | null {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    return raw ? (JSON.parse(raw) as Dataset) : null;
  } catch { return null; }
}
export function clearDataset(): void {
  try { localStorage.removeItem(DATA_KEY); } catch { /* ignore */ }
}

export function getTheme(): 'light' | 'dark' {
  try { const v = localStorage.getItem(THEME_KEY); if (v === 'dark' || v === 'light') return v; } catch { /* ignore */ }
  return 'light';
}
