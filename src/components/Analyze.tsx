// Analyze view — pick an analysis, choose variables, get paper-ready output.
// Each analysis maps to a pure function in lib/stats.ts; this component is just
// the control surface + result tables + an optional AI "write-up" that narrates
// the numbers in APA style (Groq server-side, deterministic fallback offline).

import { useMemo, useState } from 'react';
import type { Cell, Dataset } from '../lib/types';
import { column } from '../lib/parse';
import {
  describe, cronbach, correlationMatrix, independentTTest, pairedTTest,
  oneWayAnova, regression, chiSquare, fmt, fmtP, pStars,
} from '../lib/stats';

type Kind = 'descriptives' | 'reliability' | 'correlation' | 'ttest' | 'anova' | 'regression' | 'chisquare';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'descriptives', label: 'Descriptives' },
  { key: 'reliability', label: 'Reliability (α/ω)' },
  { key: 'correlation', label: 'Correlations' },
  { key: 'ttest', label: 't-test' },
  { key: 'anova', label: 'ANOVA' },
  { key: 'regression', label: 'Regression' },
  { key: 'chisquare', label: 'Chi-square' },
];

export default function Analyze({ dataset }: { dataset: Dataset }) {
  const [kind, setKind] = useState<Kind>('descriptives');

  const numeric = dataset.variables.filter(v => v.type === 'numeric' || v.type === 'likert').map(v => v.name);
  const cats = dataset.variables.filter(v => v.type === 'categorical');
  const cats2 = cats.filter(v => (v.levels?.length ?? 0) === 2).map(v => v.name);
  const catNames = cats.map(v => v.name);

  const cols = useMemo(() => {
    const m: Record<string, Cell[]> = {};
    for (const v of dataset.variables) m[v.name] = column(dataset, v.name);
    return m;
  }, [dataset]);

  return (
    <div>
      <div className="seg">
        {KINDS.map(k => (
          <button key={k.key} className={`seg-btn ${kind === k.key ? 'active' : ''}`} onClick={() => setKind(k.key)}>{k.label}</button>
        ))}
      </div>

      {kind === 'descriptives' && <Descriptives cols={cols} numeric={numeric} />}
      {kind === 'reliability' && <Reliability cols={cols} numeric={numeric} />}
      {kind === 'correlation' && <Correlation cols={cols} numeric={numeric} />}
      {kind === 'ttest' && <TTest cols={cols} numeric={numeric} cats2={cats2} />}
      {kind === 'anova' && <Anova cols={cols} numeric={numeric} catNames={catNames} />}
      {kind === 'regression' && <Regression cols={cols} numeric={numeric} />}
      {kind === 'chisquare' && <ChiSq cols={cols} catNames={catNames} />}
    </div>
  );
}

// ---- reusable controls -------------------------------------------------------
function MultiPick({ all, sel, set, label }: { all: string[]; sel: string[]; set: (s: string[]) => void; label: string }) {
  return (
    <div className="pick">
      <div className="pick-label">{label}</div>
      <div className="pick-chips">
        {all.map(v => (
          <button key={v} className={`chip ${sel.includes(v) ? 'active' : ''}`}
            onClick={() => set(sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v])}>{v}</button>
        ))}
      </div>
    </div>
  );
}
function Pick({ all, val, set, label, placeholder = '—' }: { all: string[]; val: string; set: (s: string) => void; label: string; placeholder?: string }) {
  return (
    <div className="pick">
      <div className="pick-label">{label}</div>
      <select value={val} onChange={e => set(e.target.value)}>
        <option value="">{placeholder}</option>
        {all.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}

function AIWriteup({ analysis, result }: { analysis: string; result: unknown }) {
  const [text, setText] = useState(''); const [loading, setLoading] = useState(false); const [src, setSrc] = useState('');
  async function run() {
    setLoading(true);
    try {
      const r = await fetch('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis, result }) });
      const data = await r.json();
      setText(data.text || ''); setSrc(data._source || '');
    } catch { setText('Could not reach the interpreter endpoint (run with the API deployed, or set GROQ_API_KEY).'); }
    finally { setLoading(false); }
  }
  return (
    <div className="ai-writeup">
      <button className="btn ghost" onClick={run} disabled={loading}>{loading ? 'Writing…' : '✎ Write up (APA)'}</button>
      {text && <div className="ai-text">{text}{src === 'fallback' && <span className="muted"> — offline template</span>}</div>}
    </div>
  );
}

// ---- Descriptives ------------------------------------------------------------
function Descriptives({ cols, numeric }: { cols: Record<string, Cell[]>; numeric: string[] }) {
  const [sel, setSel] = useState<string[]>(numeric.slice(0, 6));
  const rows = sel.map(v => describe(v, cols[v]));
  return (
    <div>
      <MultiPick all={numeric} sel={sel} set={setSel} label="Variables" />
      {rows.length > 0 && (
        <table className="grid stats">
          <thead><tr><th>Variable</th><th>N</th><th>Missing</th><th>M</th><th>SD</th><th>Min</th><th>Max</th><th>Median</th><th>Skew</th><th>Kurt</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.variable}><td>{r.variable}</td><td>{r.n}</td><td>{r.missing}</td><td>{fmt(r.mean)}</td><td>{fmt(r.sd)}</td><td>{fmt(r.min)}</td><td>{fmt(r.max)}</td><td>{fmt(r.median)}</td><td>{fmt(r.skewness)}</td><td>{fmt(r.kurtosis)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {rows.length > 0 && <AIWriteup analysis="descriptive statistics" result={rows} />}
    </div>
  );
}

// ---- Reliability -------------------------------------------------------------
function Reliability({ cols, numeric }: { cols: Record<string, Cell[]>; numeric: string[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const res = sel.length >= 2 ? cronbach(cols, sel) : null;
  return (
    <div>
      <MultiPick all={numeric} sel={sel} set={setSel} label="Scale items (pick ≥ 2)" />
      <p className="muted small">Tip: this duplicates ScaleScope's reliability calculator — for designing/selecting scales, see <a href="https://scalescope.vercel.app" target="_blank" rel="noreferrer">ScaleScope</a>.</p>
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">α = {fmt(res.alpha, 3)}</span>
            {res.omega != null && <span className="big-stat">ω ≈ {fmt(res.omega, 3)}</span>}
            <span className="muted">{res.k} items · N = {res.n} complete cases</span>
          </div>
          {res.reversedSuggestions.length > 0 && <div className="warn-box">Possible reverse-keyed (negative item-total r): {res.reversedSuggestions.join(', ')}</div>}
          <table className="grid stats">
            <thead><tr><th>Item</th><th>Corrected item-total r</th><th>α if deleted</th></tr></thead>
            <tbody>{res.itemTotal.map(t => <tr key={t.item}><td>{t.item}</td><td>{fmt(t.corrected_r, 3)}</td><td>{fmt(t.alpha_if_deleted, 3)}</td></tr>)}</tbody>
          </table>
          <AIWriteup analysis="scale reliability (Cronbach's alpha)" result={res} />
        </>
      )}
    </div>
  );
}

// ---- Correlation -------------------------------------------------------------
function Correlation({ cols, numeric }: { cols: Record<string, Cell[]>; numeric: string[] }) {
  const [sel, setSel] = useState<string[]>(numeric.slice(0, 5));
  const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson');
  const res = sel.length >= 2 ? correlationMatrix(cols, sel, method) : null;
  return (
    <div>
      <MultiPick all={numeric} sel={sel} set={setSel} label="Variables (pick ≥ 2)" />
      <div className="inline-toggle">
        <button className={`chip ${method === 'pearson' ? 'active' : ''}`} onClick={() => setMethod('pearson')}>Pearson</button>
        <button className={`chip ${method === 'spearman' ? 'active' : ''}`} onClick={() => setMethod('spearman')}>Spearman</button>
      </div>
      {res && (
        <>
          <table className="grid stats corr">
            <thead><tr><th></th>{res.vars.map(v => <th key={v}>{v}</th>)}</tr></thead>
            <tbody>{res.vars.map((v, i) => (
              <tr key={v}><th>{v}</th>{res.vars.map((_, j) => (
                <td key={j} className={j < i ? 'corr-cell' : 'corr-empty'}>{j < i ? <span>{fmt(res.r[i][j], 2)}<sup>{pStars(res.p[i][j])}</sup></span> : j === i ? '—' : ''}</td>
              ))}</tr>
            ))}</tbody>
          </table>
          <div className="muted small">* p &lt; .05, ** p &lt; .01, *** p &lt; .001 (two-tailed). Pairwise N.</div>
          <AIWriteup analysis={`${method} correlation matrix`} result={res} />
        </>
      )}
    </div>
  );
}

// ---- t-test ------------------------------------------------------------------
function TTest({ cols, numeric, cats2 }: { cols: Record<string, Cell[]>; numeric: string[]; cats2: string[] }) {
  const [mode, setMode] = useState<'independent' | 'paired'>('independent');
  const [dv, setDv] = useState(''); const [grp, setGrp] = useState('');
  const [x, setX] = useState(''); const [y, setY] = useState('');

  let res = null, levels: string[] = [];
  if (mode === 'independent' && dv && grp) {
    const g = cols[grp].map(String); levels = [...new Set(cols[grp].filter(c => c !== null && c !== '').map(String))].sort();
    if (levels.length === 2) {
      const a: number[] = [], b: number[] = [];
      cols[dv].forEach((c, i) => { const n = Number(c); if (Number.isFinite(n) && c !== null && c !== '') { if (g[i] === levels[0]) a.push(n); else if (g[i] === levels[1]) b.push(n); } });
      if (a.length > 1 && b.length > 1) res = { ...independentTTest(a, b), groups: [levels[0], levels[1]] as [string, string] };
    }
  } else if (mode === 'paired' && x && y) {
    const xa: number[] = [], ya: number[] = [];
    for (let i = 0; i < cols[x].length; i++) { const a = Number(cols[x][i]), b = Number(cols[y][i]); if (Number.isFinite(a) && Number.isFinite(b) && cols[x][i] !== null && cols[y][i] !== null) { xa.push(a); ya.push(b); } }
    if (xa.length > 1) res = pairedTTest(xa, ya);
  }

  return (
    <div>
      <div className="inline-toggle">
        <button className={`chip ${mode === 'independent' ? 'active' : ''}`} onClick={() => setMode('independent')}>Independent</button>
        <button className={`chip ${mode === 'paired' ? 'active' : ''}`} onClick={() => setMode('paired')}>Paired</button>
      </div>
      {mode === 'independent' ? (
        <div className="pick-row">
          <Pick all={numeric} val={dv} set={setDv} label="Outcome (numeric)" />
          <Pick all={cats2} val={grp} set={setGrp} label="Grouping (2 levels)" />
        </div>
      ) : (
        <div className="pick-row">
          <Pick all={numeric} val={x} set={setX} label="Measure 1" />
          <Pick all={numeric} val={y} set={setY} label="Measure 2" />
        </div>
      )}
      {grp && mode === 'independent' && levels.length !== 2 && <div className="warn-box">Grouping variable needs exactly 2 levels.</div>}
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">t({fmt(res.df, 1)}) = {fmt(res.t)}</span>
            <span className="big-stat">p = {fmtP(res.p)}</span>
            <span className="big-stat">d = {fmt(res.cohensD)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Group</th><th>N</th><th>M</th><th>SD</th></tr></thead>
            <tbody>
              <tr><td>{res.groups ? res.groups[0] : 'Measure 1'}</td><td>{res.n1}</td><td>{fmt(res.m1)}</td><td>{fmt(res.sd1)}</td></tr>
              <tr><td>{res.groups ? res.groups[1] : 'Measure 2'}</td><td>{res.n2}</td><td>{fmt(res.m2)}</td><td>{fmt(res.sd2)}</td></tr>
            </tbody>
          </table>
          <div className="muted small">Mean difference {fmt(res.meanDiff)}, 95% CI [{fmt(res.ci95[0])}, {fmt(res.ci95[1])}].{mode === 'independent' ? ' Welch t-test.' : ''}</div>
          <AIWriteup analysis={`${mode} t-test`} result={res} />
        </>
      )}
    </div>
  );
}

// ---- ANOVA -------------------------------------------------------------------
function Anova({ cols, numeric, catNames }: { cols: Record<string, Cell[]>; numeric: string[]; catNames: string[] }) {
  const [dv, setDv] = useState(''); const [factor, setFactor] = useState('');
  let res = null;
  if (dv && factor) {
    const levels = [...new Set(cols[factor].filter(c => c !== null && c !== '').map(String))].sort();
    const groups = levels.map(lv => ({ level: lv, values: [] as number[] }));
    cols[dv].forEach((c, i) => { const n = Number(c); const g = cols[factor][i]; if (Number.isFinite(n) && c !== null && c !== '' && g !== null && g !== '') { const idx = levels.indexOf(String(g)); if (idx >= 0) groups[idx].values.push(n); } });
    if (groups.every(g => g.values.length > 1) && groups.length >= 2) res = oneWayAnova(dv, factor, groups);
  }
  return (
    <div>
      <div className="pick-row">
        <Pick all={numeric} val={dv} set={setDv} label="Outcome (numeric)" />
        <Pick all={catNames} val={factor} set={setFactor} label="Factor (categorical)" />
      </div>
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">F({res.dfBetween}, {res.dfWithin}) = {fmt(res.fStat)}</span>
            <span className="big-stat">p = {fmtP(res.p)}</span>
            <span className="big-stat">η² = {fmt(res.etaSquared, 3)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Group</th><th>N</th><th>M</th><th>SD</th></tr></thead>
            <tbody>{res.groups.map(g => <tr key={g.level}><td>{g.level}</td><td>{g.n}</td><td>{fmt(g.mean)}</td><td>{fmt(g.sd)}</td></tr>)}</tbody>
          </table>
          {res.postHoc && res.postHoc.length > 0 && (
            <>
              <div className="sub-label">Post-hoc (Bonferroni-corrected pairwise)</div>
              <table className="grid stats">
                <thead><tr><th>Comparison</th><th>Mean diff</th><th>p (adj)</th></tr></thead>
                <tbody>{res.postHoc.map((p, i) => <tr key={i}><td>{p.a} vs {p.b}</td><td>{fmt(p.meanDiff)}</td><td>{fmtP(p.p)}{pStars(p.p)}</td></tr>)}</tbody>
              </table>
            </>
          )}
          <AIWriteup analysis="one-way ANOVA" result={res} />
        </>
      )}
    </div>
  );
}

// ---- Regression --------------------------------------------------------------
function Regression({ cols, numeric }: { cols: Record<string, Cell[]>; numeric: string[] }) {
  const [dv, setDv] = useState(''); const [preds, setPreds] = useState<string[]>([]);
  let res = null;
  if (dv && preds.length >= 1 && !preds.includes(dv)) {
    const y: number[] = []; const X: number[][] = [];
    for (let i = 0; i < cols[dv].length; i++) {
      const yv = Number(cols[dv][i]); const xs = preds.map(p => Number(cols[p][i]));
      if (Number.isFinite(yv) && cols[dv][i] !== null && cols[dv][i] !== '' && xs.every(Number.isFinite)) { y.push(yv); X.push(xs); }
    }
    if (y.length > preds.length + 1) res = regression(dv, y, preds, X);
  }
  return (
    <div>
      <Pick all={numeric} val={dv} set={setDv} label="Outcome (DV)" />
      <MultiPick all={numeric.filter(v => v !== dv)} sel={preds} set={setPreds} label="Predictors" />
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">R² = {fmt(res.r2, 3)}</span>
            <span className="big-stat">adj R² = {fmt(res.adjR2, 3)}</span>
            <span className="big-stat">F({res.dfModel}, {res.dfResid}) = {fmt(res.fStat)}</span>
            <span className="big-stat">p = {fmtP(res.pModel)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Term</th><th>B</th><th>SE</th><th>β</th><th>t</th><th>p</th><th>VIF</th></tr></thead>
            <tbody>{res.coefficients.map(c => (
              <tr key={c.term}><td>{c.term}</td><td>{fmt(c.b, 3)}</td><td>{fmt(c.se, 3)}</td><td>{c.term === 'intercept' ? '—' : fmt(c.beta, 3)}</td><td>{fmt(c.t)}</td><td>{fmtP(c.p)}{pStars(c.p)}</td><td>{c.vif != null ? fmt(c.vif) : '—'}</td></tr>
            ))}</tbody>
          </table>
          <AIWriteup analysis="multiple linear regression" result={res} />
        </>
      )}
      {dv && preds.includes(dv) && <div className="warn-box">The DV can't also be a predictor.</div>}
    </div>
  );
}

// ---- Chi-square --------------------------------------------------------------
function ChiSq({ cols, catNames }: { cols: Record<string, Cell[]>; catNames: string[] }) {
  const [rowV, setRowV] = useState(''); const [colV, setColV] = useState('');
  const res = rowV && colV && rowV !== colV ? chiSquare(rowV, colV, cols[rowV], cols[colV]) : null;
  return (
    <div>
      <div className="pick-row">
        <Pick all={catNames} val={rowV} set={setRowV} label="Rows (categorical)" />
        <Pick all={catNames} val={colV} set={setColV} label="Columns (categorical)" />
      </div>
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">χ²({res.df}) = {fmt(res.chi2)}</span>
            <span className="big-stat">p = {fmtP(res.p)}</span>
            <span className="big-stat">Cramér's V = {fmt(res.cramersV, 3)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>{res.rowVar} \ {res.colVar}</th>{res.colLevels.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{res.rowLevels.map((rl, i) => (
              <tr key={rl}><th>{rl}</th>{res.colLevels.map((_, j) => <td key={j}>{res.observed[i][j]}<span className="muted exp"> ({fmt(res.expected[i][j], 1)})</span></td>)}</tr>
            ))}</tbody>
          </table>
          <div className="muted small">Cells show observed (expected).</div>
          <AIWriteup analysis="chi-square test of independence" result={res} />
        </>
      )}
    </div>
  );
}
