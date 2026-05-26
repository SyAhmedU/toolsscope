// SVG chart primitives — dependency-free, themed via CSS variables. These are
// the figures researchers actually put in papers: histogram, group means with
// error bars, boxplot, scatter + OLS fit, correlation heatmap, Likert stacked
// bars. Each is a pure presentational component over already-computed data.

import { mean, sd } from '../lib/stats';

const WARM = ['#F14575', '#FF9656', '#9270F4', '#22d3ee', '#1b8a5a', '#c97a1a', '#ec4899', '#2e6cf6'];
const AXIS = 'var(--ink-mute)';
const INK = 'var(--ink)';

function niceTicks(min: number, max: number, n = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// ---- Histogram ---------------------------------------------------------------
export function Histogram({ values, label, bins = 12 }: { values: number[]; label: string; bins?: number }) {
  const W = 460, H = 280, pad = { l: 44, r: 14, t: 14, b: 40 };
  if (values.length === 0) return <Empty label="No numeric data" />;
  const min = Math.min(...values), max = Math.max(...values);
  const bw = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) { let b = Math.floor((v - min) / bw); if (b >= bins) b = bins - 1; if (b < 0) b = 0; counts[b]++; }
  const maxC = Math.max(...counts);
  const xw = (W - pad.l - pad.r) / bins;
  const yh = H - pad.t - pad.b;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Histogram of ${label}`}>
      {niceTicks(0, maxC).map(t => {
        const y = pad.t + yh - (t / maxC) * yh;
        return <g key={t}><line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--line)" /><text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS}>{t}</text></g>;
      })}
      {counts.map((c, i) => {
        const h = (c / maxC) * yh;
        return <rect key={i} x={pad.l + i * xw + 1} y={pad.t + yh - h} width={xw - 2} height={h} fill={WARM[0]} opacity={0.85} rx={2} />;
      })}
      <text x={pad.l - 6} y={pad.t + yh + 24} fontSize="10" fill={AXIS}>{round(min)}</text>
      <text x={W - pad.r} y={pad.t + yh + 24} fontSize="10" fill={AXIS} textAnchor="end">{round(max)}</text>
      <text x={(W) / 2} y={H - 6} fontSize="11" fill={INK} textAnchor="middle" fontWeight={600}>{label}</text>
    </svg>
  );
}

// ---- Group means with error bars (±95% CI) ----------------------------------
export function BarMeans({ groups, dv }: { groups: { label: string; values: number[] }[]; dv: string }) {
  const W = 460, H = 300, pad = { l: 48, r: 14, t: 16, b: 56 };
  const stats = groups.map(g => { const m = mean(g.values); const s = g.values.length > 1 ? sd(g.values) : 0; const se = s / Math.sqrt(g.values.length); return { label: g.label, m, ci: 1.96 * se }; });
  const maxV = Math.max(...stats.map(s => s.m + s.ci), 0);
  const yh = H - pad.t - pad.b, bw = (W - pad.l - pad.r) / stats.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Means of ${dv} by group`}>
      {niceTicks(0, maxV).map(t => { const y = pad.t + yh - (t / maxV) * yh; return <g key={t}><line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--line)" /><text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS}>{round(t)}</text></g>; })}
      {stats.map((s, i) => {
        const cx = pad.l + i * bw + bw / 2;
        const h = (s.m / maxV) * yh, y = pad.t + yh - h;
        const ciTop = pad.t + yh - ((s.m + s.ci) / maxV) * yh, ciBot = pad.t + yh - ((s.m - s.ci) / maxV) * yh;
        return (
          <g key={i}>
            <rect x={cx - bw * 0.32} y={y} width={bw * 0.64} height={h} fill={WARM[i % WARM.length]} opacity={0.85} rx={3} />
            <line x1={cx} y1={ciTop} x2={cx} y2={ciBot} stroke={INK} strokeWidth={1.5} />
            <line x1={cx - 5} y1={ciTop} x2={cx + 5} y2={ciTop} stroke={INK} strokeWidth={1.5} />
            <line x1={cx - 5} y1={ciBot} x2={cx + 5} y2={ciBot} stroke={INK} strokeWidth={1.5} />
            <text x={cx} y={H - 30} fontSize="10" fill={INK} textAnchor="middle">{s.label}</text>
            <text x={cx} y={H - 18} fontSize="9" fill={AXIS} textAnchor="middle">M={round(s.m)}</text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 4} fontSize="11" fill={INK} textAnchor="middle" fontWeight={600}>{dv} (mean ± 95% CI)</text>
    </svg>
  );
}

// ---- Boxplot -----------------------------------------------------------------
export function Boxplot({ groups, dv }: { groups: { label: string; values: number[] }[]; dv: string }) {
  const W = 460, H = 300, pad = { l: 48, r: 14, t: 16, b: 48 };
  const all = groups.flatMap(g => g.values);
  if (all.length === 0) return <Empty label="No data" />;
  const lo = Math.min(...all), hi = Math.max(...all);
  const yh = H - pad.t - pad.b, bw = (W - pad.l - pad.r) / groups.length;
  const yOf = (v: number) => pad.t + yh - ((v - lo) / (hi - lo || 1)) * yh;
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const pos = (s.length - 1) * p; const b = Math.floor(pos); return s[b + 1] !== undefined ? s[b] + (pos - b) * (s[b + 1] - s[b]) : s[b]; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Boxplot of ${dv}`}>
      {niceTicks(lo, hi).map(t => { const y = yOf(t); return <g key={t}><line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--line)" /><text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS}>{round(t)}</text></g>; })}
      {groups.map((g, i) => {
        const cx = pad.l + i * bw + bw / 2;
        const q1 = q(g.values, 0.25), med = q(g.values, 0.5), q3 = q(g.values, 0.75);
        const iqr = q3 - q1; const whisLo = Math.max(Math.min(...g.values), q1 - 1.5 * iqr), whisHi = Math.min(Math.max(...g.values), q3 + 1.5 * iqr);
        const col = WARM[i % WARM.length];
        return (
          <g key={i}>
            <line x1={cx} y1={yOf(whisHi)} x2={cx} y2={yOf(whisLo)} stroke={AXIS} />
            <rect x={cx - bw * 0.28} y={yOf(q3)} width={bw * 0.56} height={yOf(q1) - yOf(q3)} fill={col} opacity={0.35} stroke={col} />
            <line x1={cx - bw * 0.28} y1={yOf(med)} x2={cx + bw * 0.28} y2={yOf(med)} stroke={col} strokeWidth={2} />
            <text x={cx} y={H - 18} fontSize="10" fill={INK} textAnchor="middle">{g.label}</text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 4} fontSize="11" fill={INK} textAnchor="middle" fontWeight={600}>{dv}</text>
    </svg>
  );
}

// ---- Scatter + OLS fit -------------------------------------------------------
export function Scatter({ points, xlab, ylab }: { points: { x: number; y: number }[]; xlab: string; ylab: string }) {
  const W = 460, H = 320, pad = { l: 48, r: 16, t: 16, b: 44 };
  if (points.length === 0) return <Empty label="No paired data" />;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys);
  const xw = W - pad.l - pad.r, yh = H - pad.t - pad.b;
  const xOf = (v: number) => pad.l + ((v - xlo) / (xhi - xlo || 1)) * xw;
  const yOf = (v: number) => pad.t + yh - ((v - ylo) / (yhi - ylo || 1)) * yh;
  // OLS fit
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0, intercept = my - slope * mx;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Scatter of ${ylab} on ${xlab}`}>
      {niceTicks(ylo, yhi).map(t => { const y = yOf(t); return <g key={'y' + t}><line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--line)" /><text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS}>{round(t)}</text></g>; })}
      {niceTicks(xlo, xhi).map(t => <text key={'x' + t} x={xOf(t)} y={H - 26} fontSize="10" fill={AXIS} textAnchor="middle">{round(t)}</text>)}
      {points.map((p, i) => <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r={3} fill={WARM[2]} opacity={0.6} />)}
      <line x1={xOf(xlo)} y1={yOf(intercept + slope * xlo)} x2={xOf(xhi)} y2={yOf(intercept + slope * xhi)} stroke={WARM[0]} strokeWidth={2} />
      <text x={W / 2} y={H - 12} fontSize="11" fill={INK} textAnchor="middle" fontWeight={600}>{xlab}</text>
      <text x={14} y={pad.t + yh / 2} fontSize="11" fill={INK} textAnchor="middle" transform={`rotate(-90 14 ${pad.t + yh / 2})`} fontWeight={600}>{ylab}</text>
    </svg>
  );
}

// ---- Correlation heatmap -----------------------------------------------------
export function Heatmap({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const k = labels.length;
  const cell = Math.max(26, Math.min(54, Math.floor(420 / k)));
  const left = 96, top = 96, W = left + k * cell + 12, H = top + k * cell + 12;
  const colorFor = (r: number) => {
    if (!Number.isFinite(r)) return 'var(--bg-soft)';
    const a = Math.abs(r);
    return r >= 0 ? `rgba(241,69,117,${0.12 + a * 0.78})` : `rgba(46,108,246,${0.12 + a * 0.78})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: W }} role="img" aria-label="Correlation heatmap">
      {labels.map((l, j) => <text key={'c' + j} x={left + j * cell + cell / 2} y={top - 8} fontSize="10" fill={INK} textAnchor="start" transform={`rotate(-45 ${left + j * cell + cell / 2} ${top - 8})`}>{trunc(l)}</text>)}
      {labels.map((l, i) => <text key={'r' + i} x={left - 8} y={top + i * cell + cell / 2 + 3} fontSize="10" fill={INK} textAnchor="end">{trunc(l)}</text>)}
      {matrix.map((row, i) => row.map((r, j) => (
        <g key={`${i}-${j}`}>
          <rect x={left + j * cell} y={top + i * cell} width={cell - 2} height={cell - 2} fill={colorFor(r)} rx={3} />
          <text x={left + j * cell + cell / 2 - 1} y={top + i * cell + cell / 2 + 3} fontSize={cell > 38 ? 10 : 8} fill={INK} textAnchor="middle">{Number.isFinite(r) ? r.toFixed(2).replace(/^0/, '').replace(/^-0/, '-') : ''}</text>
        </g>
      )))}
    </svg>
  );
}

// ---- Likert stacked bars -----------------------------------------------------
export function LikertStacked({ items, min, max }: { items: { label: string; counts: number[] }[]; min: number; max: number }) {
  const levels = max - min + 1;
  const W = 520, rowH = 30, pad = { l: 120, r: 16, t: 12, b: 28 };
  const H = pad.t + items.length * rowH + pad.b;
  const barW = W - pad.l - pad.r;
  // diverging palette from blue (low) to pink (high)
  const palette = (i: number) => {
    const t = levels > 1 ? i / (levels - 1) : 0.5;
    const r = Math.round(46 + t * (241 - 46)), g = Math.round(108 + t * (69 - 108)), b = Math.round(246 + t * (117 - 246));
    return `rgb(${r},${g},${b})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Likert response distribution">
      {items.map((it, row) => {
        const total = it.counts.reduce((a, b) => a + b, 0) || 1;
        let x = pad.l;
        const y = pad.t + row * rowH;
        return (
          <g key={it.label}>
            <text x={pad.l - 8} y={y + rowH / 2 + 1} fontSize="11" fill={INK} textAnchor="end">{trunc(it.label, 16)}</text>
            {it.counts.map((c, i) => { const w = (c / total) * barW; const rect = <rect key={i} x={x} y={y + 4} width={Math.max(0, w - 0.5)} height={rowH - 10} fill={palette(i)} />; x += w; return rect; })}
          </g>
        );
      })}
      {Array.from({ length: levels }, (_, i) => (
        <g key={'leg' + i}>
          <rect x={pad.l + i * 28} y={H - 18} width={14} height={10} fill={palette(i)} />
          <text x={pad.l + i * 28 + 16} y={H - 9} fontSize="9" fill={AXIS}>{min + i}</text>
        </g>
      ))}
    </svg>
  );
}

// ---- helpers -----------------------------------------------------------------
function Empty({ label }: { label: string }) {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>{label}</div>;
}
function round(x: number): number | string { if (!Number.isFinite(x)) return '—'; const a = Math.abs(x); return a >= 100 ? Math.round(x) : a >= 1 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100; }
function trunc(s: string, n = 12): string { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
