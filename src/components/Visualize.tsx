// Visualize view — the figures that go in papers. Pick a chart and the
// variables; the SVG primitives in Charts.tsx render from already-extracted
// data. Right-click the chart to "Save image as…" (it's plain SVG).

import { useState } from 'react';
import type { Cell, Dataset } from '../lib/types';
import { column } from '../lib/parse';
import { correlationMatrix, toNumbers } from '../lib/stats';
import { Histogram, BarMeans, Boxplot, Scatter, Heatmap, LikertStacked } from './Charts';

type Chart = 'histogram' | 'bar-means' | 'boxplot' | 'scatter' | 'heatmap' | 'likert-stacked';
const CHARTS: { key: Chart; label: string }[] = [
  { key: 'histogram', label: 'Histogram' },
  { key: 'bar-means', label: 'Means ± CI' },
  { key: 'boxplot', label: 'Boxplot' },
  { key: 'scatter', label: 'Scatter + fit' },
  { key: 'heatmap', label: 'Correlation heatmap' },
  { key: 'likert-stacked', label: 'Likert stacked' },
];

export default function Visualize({ dataset }: { dataset: Dataset }) {
  const [chart, setChart] = useState<Chart>('histogram');
  const numeric = dataset.variables.filter(v => v.type === 'numeric' || v.type === 'likert').map(v => v.name);
  const likertVars = dataset.variables.filter(v => v.type === 'likert');
  const cats = dataset.variables.filter(v => v.type === 'categorical').map(v => v.name);
  const colOf = (n: string): Cell[] => column(dataset, n);

  return (
    <div>
      <div className="seg">
        {CHARTS.map(c => <button key={c.key} className={`seg-btn ${chart === c.key ? 'active' : ''}`} onClick={() => setChart(c.key)}>{c.label}</button>)}
      </div>
      <div className="viz-wrap">
        {chart === 'histogram' && <Single numeric={numeric} render={v => <Histogram values={toNumbers(colOf(v))} label={v} />} />}
        {chart === 'scatter' && <Pair numeric={numeric} render={(x, y) => {
          const xs: number[] = [], ys: number[] = []; const cx = colOf(x), cy = colOf(y);
          for (let i = 0; i < cx.length; i++) { const a = Number(cx[i]), b = Number(cy[i]); if (Number.isFinite(a) && Number.isFinite(b) && cx[i] !== null && cy[i] !== null) { xs.push(a); ys.push(b); } }
          return <Scatter points={xs.map((x2, i) => ({ x: x2, y: ys[i] }))} xlab={x} ylab={y} />;
        }} />}
        {(chart === 'bar-means' || chart === 'boxplot') && <DvFactor numeric={numeric} cats={cats} render={(dv, factor) => {
          const levels = [...new Set(colOf(factor).filter(c => c !== null && c !== '').map(String))].sort();
          const groups = levels.map(lv => ({ label: lv, values: [] as number[] }));
          const cdv = colOf(dv), cf = colOf(factor);
          cdv.forEach((c, i) => { const n = Number(c); if (Number.isFinite(n) && c !== null && c !== '') { const idx = levels.indexOf(String(cf[i])); if (idx >= 0) groups[idx].values.push(n); } });
          return chart === 'bar-means' ? <BarMeans groups={groups} dv={dv} /> : <Boxplot groups={groups} dv={dv} />;
        }} />}
        {chart === 'heatmap' && <MultiNumeric numeric={numeric} render={vars => {
          const cols: Record<string, Cell[]> = {}; vars.forEach(v => cols[v] = colOf(v));
          const res = correlationMatrix(cols, vars, 'pearson');
          return <Heatmap labels={res.vars} matrix={res.r} />;
        }} />}
        {chart === 'likert-stacked' && <LikertPick likertVars={likertVars} render={(items, min, max) => {
          const data = items.map(it => {
            const counts = new Array(max - min + 1).fill(0);
            colOf(it).forEach(c => { const n = Number(c); if (Number.isFinite(n) && n >= min && n <= max) counts[n - min]++; });
            return { label: it, counts };
          });
          return <LikertStacked items={data} min={min} max={max} />;
        }} />}
      </div>
    </div>
  );
}

function Single({ numeric, render }: { numeric: string[]; render: (v: string) => React.ReactNode }) {
  const [v, setV] = useState(numeric[0] ?? '');
  return <div><Sel all={numeric} val={v} set={setV} label="Variable" />{v && render(v)}</div>;
}
function Pair({ numeric, render }: { numeric: string[]; render: (x: string, y: string) => React.ReactNode }) {
  const [x, setX] = useState(numeric[0] ?? ''); const [y, setY] = useState(numeric[1] ?? '');
  return <div className="pick-row"><Sel all={numeric} val={x} set={setX} label="X" /><Sel all={numeric} val={y} set={setY} label="Y" />{x && y && <div style={{ flexBasis: '100%' }}>{render(x, y)}</div>}</div>;
}
function DvFactor({ numeric, cats, render }: { numeric: string[]; cats: string[]; render: (dv: string, factor: string) => React.ReactNode }) {
  const [dv, setDv] = useState(numeric[0] ?? ''); const [f, setF] = useState(cats[0] ?? '');
  return <div><div className="pick-row"><Sel all={numeric} val={dv} set={setDv} label="Outcome" /><Sel all={cats} val={f} set={setF} label="Group" /></div>{dv && f && render(dv, f)}</div>;
}
function MultiNumeric({ numeric, render }: { numeric: string[]; render: (vars: string[]) => React.ReactNode }) {
  const [sel, setSel] = useState<string[]>(numeric.slice(0, 6));
  return <div><Chips all={numeric} sel={sel} set={setSel} label="Variables (≥ 2)" />{sel.length >= 2 && render(sel)}</div>;
}
function LikertPick({ likertVars, render }: { likertVars: Dataset['variables']; render: (items: string[], min: number, max: number) => React.ReactNode }) {
  const names = likertVars.map(v => v.name);
  const [sel, setSel] = useState<string[]>(names.slice(0, 5));
  if (names.length === 0) return <div className="empty-hint"><p>No Likert variables detected. Set a variable's type to "likert" in the Data tab.</p></div>;
  const chosen = likertVars.filter(v => sel.includes(v.name));
  const min = Math.min(...chosen.map(v => v.likertMin ?? 1)); const max = Math.max(...chosen.map(v => v.likertMax ?? 7));
  return <div><Chips all={names} sel={sel} set={setSel} label="Likert items" />{sel.length >= 1 && render(sel, min, max)}</div>;
}

function Sel({ all, val, set, label }: { all: string[]; val: string; set: (s: string) => void; label: string }) {
  return <div className="pick"><div className="pick-label">{label}</div><select value={val} onChange={e => set(e.target.value)}><option value="">—</option>{all.map(v => <option key={v} value={v}>{v}</option>)}</select></div>;
}
function Chips({ all, sel, set, label }: { all: string[]; sel: string[]; set: (s: string[]) => void; label: string }) {
  return <div className="pick"><div className="pick-label">{label}</div><div className="pick-chips">{all.map(v => <button key={v} className={`chip ${sel.includes(v) ? 'active' : ''}`} onClick={() => set(sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v])}>{v}</button>)}</div></div>;
}
