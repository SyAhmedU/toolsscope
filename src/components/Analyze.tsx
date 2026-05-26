// Analyze view — pick an analysis, choose variables, get paper-ready output.
// Each analysis maps to a pure function in lib/stats.ts; this component is just
// the control surface + result tables + AI "write-up" + a "Capture for report"
// button that pushes the result into the session report builder.

import { useMemo, useState } from 'react';
import type { Cell, Dataset } from '../lib/types';
import type { ReportEntry } from '../lib/report';
import { column } from '../lib/parse';
import {
  describe, cronbach, correlationMatrix, independentTTest, pairedTTest,
  oneWayAnova, regression, chiSquare, factorAnalysis, mannWhitney,
  wilcoxonSignedRank, kruskalWallis, mediation, moderation,
  fmt, fmtP, pStars,
} from '../lib/stats';

type Kind =
  | 'descriptives' | 'reliability' | 'correlation' | 'ttest' | 'anova'
  | 'regression' | 'chisquare' | 'factor' | 'nonparam' | 'mediation' | 'moderation';

const KINDS: { key: Kind; label: string }[] = [
  { key: 'descriptives', label: 'Descriptives' },
  { key: 'reliability', label: 'Reliability (α/ω)' },
  { key: 'correlation', label: 'Correlations' },
  { key: 'ttest', label: 't-test' },
  { key: 'anova', label: 'ANOVA' },
  { key: 'regression', label: 'Regression' },
  { key: 'chisquare', label: 'Chi-square' },
  { key: 'factor', label: 'Factor analysis' },
  { key: 'nonparam', label: 'Nonparametric' },
  { key: 'mediation', label: 'Mediation' },
  { key: 'moderation', label: 'Moderation' },
];

export default function Analyze({ dataset, onCapture }: { dataset: Dataset; onCapture: (e: ReportEntry) => void }) {
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

      {kind === 'descriptives' && <Descriptives cols={cols} numeric={numeric} onCapture={onCapture} />}
      {kind === 'reliability' && <Reliability cols={cols} numeric={numeric} onCapture={onCapture} />}
      {kind === 'correlation' && <Correlation cols={cols} numeric={numeric} onCapture={onCapture} />}
      {kind === 'ttest' && <TTest cols={cols} numeric={numeric} cats2={cats2} onCapture={onCapture} />}
      {kind === 'anova' && <Anova cols={cols} numeric={numeric} catNames={catNames} onCapture={onCapture} />}
      {kind === 'regression' && <Regression cols={cols} numeric={numeric} onCapture={onCapture} />}
      {kind === 'chisquare' && <ChiSq cols={cols} catNames={catNames} onCapture={onCapture} />}
      {kind === 'factor' && <Factor cols={cols} numeric={numeric} onCapture={onCapture} />}
      {kind === 'nonparam' && <Nonparam cols={cols} numeric={numeric} cats2={cats2} catNames={catNames} onCapture={onCapture} />}
      {kind === 'mediation' && <Mediation cols={cols} numeric={numeric} onCapture={onCapture} />}
      {kind === 'moderation' && <Moderation cols={cols} numeric={numeric} onCapture={onCapture} />}
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
function CaptureBtn({ onClick }: { onClick: () => void }) {
  const [captured, setCaptured] = useState(false);
  return (
    <button className="btn ghost" onClick={() => { onClick(); setCaptured(true); setTimeout(() => setCaptured(false), 1400); }}>
      {captured ? '✓ Added' : '📋 Capture for report'}
    </button>
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

// Helper: pairwise complete numeric values for two columns.
function pairwise(a: Cell[], b: Cell[]): { x: number[]; y: number[] } {
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const xa = Number(a[i]), yb = Number(b[i]);
    if (Number.isFinite(xa) && Number.isFinite(yb) && a[i] !== null && b[i] !== null && a[i] !== '' && b[i] !== '') { x.push(xa); y.push(yb); }
  }
  return { x, y };
}
function tripleComplete(a: Cell[], b: Cell[], c: Cell[]): { x: number[]; m: number[]; y: number[] } {
  const x: number[] = [], m: number[] = [], y: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const xa = Number(a[i]), mb = Number(b[i]), yc = Number(c[i]);
    if ([a[i], b[i], c[i]].every(v => v !== null && v !== '') && [xa, mb, yc].every(Number.isFinite)) { x.push(xa); m.push(mb); y.push(yc); }
  }
  return { x, m, y };
}

// ---- Descriptives ------------------------------------------------------------
function Descriptives({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
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
      {rows.length > 0 && (
        <div className="result-actions">
          <AIWriteup analysis="descriptive statistics" result={rows} />
          <CaptureBtn onClick={() => onCapture({ kind: 'descriptives', rows })} />
        </div>
      )}
    </div>
  );
}

// ---- Reliability -------------------------------------------------------------
function Reliability({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
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
          <div className="result-actions">
            <AIWriteup analysis="scale reliability (Cronbach's alpha)" result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'reliability', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Correlation -------------------------------------------------------------
function Correlation({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
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
          <div className="result-actions">
            <AIWriteup analysis={`${method} correlation matrix`} result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'correlation', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- t-test ------------------------------------------------------------------
function TTest({ cols, numeric, cats2, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; cats2: string[]; onCapture: (e: ReportEntry) => void }) {
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
    const { x: xa, y: ya } = pairwise(cols[x], cols[y]);
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
          <div className="result-actions">
            <AIWriteup analysis={`${mode} t-test`} result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'ttest', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- ANOVA -------------------------------------------------------------------
function Anova({ cols, numeric, catNames, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; catNames: string[]; onCapture: (e: ReportEntry) => void }) {
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
          <div className="result-actions">
            <AIWriteup analysis="one-way ANOVA" result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'anova', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Regression --------------------------------------------------------------
function Regression({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
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
          <div className="result-actions">
            <AIWriteup analysis="multiple linear regression" result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'regression', result: res })} />
          </div>
        </>
      )}
      {dv && preds.includes(dv) && <div className="warn-box">The DV can't also be a predictor.</div>}
    </div>
  );
}

// ---- Chi-square --------------------------------------------------------------
function ChiSq({ cols, catNames, onCapture }: { cols: Record<string, Cell[]>; catNames: string[]; onCapture: (e: ReportEntry) => void }) {
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
          <div className="result-actions">
            <AIWriteup analysis="chi-square test of independence" result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'chisquare', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Factor analysis ---------------------------------------------------------
function Factor({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [method, setMethod] = useState<'pca' | 'efa'>('pca');
  const [rotation, setRotation] = useState<'none' | 'varimax'>('varimax');
  const [forced, setForced] = useState<string>('');  // empty = Kaiser default
  const res = sel.length >= 3
    ? factorAnalysis(cols, sel, { method, rotation, nFactors: forced ? Math.max(1, Number(forced) | 0) : undefined })
    : null;
  return (
    <div>
      <MultiPick all={numeric} sel={sel} set={setSel} label="Items (pick ≥ 3)" />
      <div className="inline-toggle">
        <button className={`chip ${method === 'pca' ? 'active' : ''}`} onClick={() => setMethod('pca')}>PCA</button>
        <button className={`chip ${method === 'efa' ? 'active' : ''}`} onClick={() => setMethod('efa')}>EFA (PAF)</button>
        <span style={{ width: 12 }} />
        <button className={`chip ${rotation === 'varimax' ? 'active' : ''}`} onClick={() => setRotation('varimax')}>Varimax</button>
        <button className={`chip ${rotation === 'none' ? 'active' : ''}`} onClick={() => setRotation('none')}>No rotation</button>
      </div>
      <div className="pick">
        <div className="pick-label">Force # of factors (blank = Kaiser ≥ 1)</div>
        <input className="cell-input" type="number" min={1} value={forced} onChange={e => setForced(e.target.value)} placeholder="auto" style={{ width: 80 }} />
      </div>
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">KMO = {fmt(res.kmo, 2)}</span>
            <span className="big-stat">χ²({res.bartlettDf}) = {fmt(res.bartlettChi2)}</span>
            <span className="big-stat">p = {fmtP(res.bartlettP)}</span>
            <span className="big-stat">{res.nFactors} factor{res.nFactors === 1 ? '' : 's'}</span>
          </div>
          <div className="sub-label">Eigenvalues & variance explained</div>
          <table className="grid stats">
            <thead><tr><th>Component</th><th>Eigenvalue</th><th>% Var</th><th>Cumulative</th></tr></thead>
            <tbody>{res.eigenvalues.slice(0, Math.min(10, res.eigenvalues.length)).map((v, i) => (
              <tr key={i}><td>F{i + 1}</td><td>{fmt(v, 3)}</td><td>{(res.varianceExplained[i] * 100).toFixed(1)}%</td><td>{(res.cumulativeVariance[i] * 100).toFixed(1)}%</td></tr>
            ))}</tbody>
          </table>
          <div className="sub-label">{res.rotation === 'varimax' ? 'Rotated loadings (varimax)' : 'Loadings'}</div>
          <table className="grid stats">
            <thead><tr><th>Item</th>{Array.from({ length: res.nFactors }, (_, i) => <th key={i}>F{i + 1}</th>)}<th>h²</th></tr></thead>
            <tbody>{res.items.map((it, i) => (
              <tr key={it}><td>{it}</td>{res.loadings[i].slice(0, res.nFactors).map((l, j) => (
                <td key={j} className={Math.abs(l) >= 0.4 ? 'corr-cell' : ''}>{fmt(l, 3)}</td>
              ))}<td>{fmt(res.communalities[i], 3)}</td></tr>
            ))}</tbody>
          </table>
          <div className="muted small">Cells highlighted at |loading| ≥ .40 (a common reporting threshold).</div>
          <div className="result-actions">
            <AIWriteup analysis={`${res.method === 'pca' ? 'principal component' : 'exploratory factor'} analysis`} result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'factor', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Nonparametric -----------------------------------------------------------
function Nonparam({ cols, numeric, cats2, catNames, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; cats2: string[]; catNames: string[]; onCapture: (e: ReportEntry) => void }) {
  const [test, setTest] = useState<'mann' | 'wilcoxon' | 'kw'>('mann');
  const [dv, setDv] = useState(''); const [grp, setGrp] = useState('');
  const [x, setX] = useState(''); const [y, setY] = useState('');

  let mwRes = null, wilRes = null, kwRes = null;
  let mwLevels: string[] = [];
  if (test === 'mann' && dv && grp) {
    mwLevels = [...new Set(cols[grp].filter(c => c !== null && c !== '').map(String))].sort();
    if (mwLevels.length === 2) {
      const a: number[] = [], b: number[] = [];
      cols[dv].forEach((c, i) => { const n = Number(c); const g = String(cols[grp][i]); if (Number.isFinite(n) && c !== null && c !== '') { if (g === mwLevels[0]) a.push(n); else if (g === mwLevels[1]) b.push(n); } });
      if (a.length > 1 && b.length > 1) mwRes = mannWhitney(a, b, [mwLevels[0], mwLevels[1]]);
    }
  } else if (test === 'wilcoxon' && x && y) {
    const { x: xa, y: ya } = pairwise(cols[x], cols[y]);
    if (xa.length > 0) wilRes = wilcoxonSignedRank(xa, ya, [x, y]);
  } else if (test === 'kw' && dv && grp) {
    const levels = [...new Set(cols[grp].filter(c => c !== null && c !== '').map(String))].sort();
    const groups = levels.map(lv => ({ level: lv, values: [] as number[] }));
    cols[dv].forEach((c, i) => { const n = Number(c); const g = String(cols[grp][i]); if (Number.isFinite(n) && c !== null && c !== '') { const idx = levels.indexOf(g); if (idx >= 0) groups[idx].values.push(n); } });
    if (groups.every(g => g.values.length > 1) && groups.length >= 2) kwRes = kruskalWallis(dv, grp, groups);
  }

  return (
    <div>
      <div className="inline-toggle">
        <button className={`chip ${test === 'mann' ? 'active' : ''}`} onClick={() => setTest('mann')}>Mann-Whitney U</button>
        <button className={`chip ${test === 'wilcoxon' ? 'active' : ''}`} onClick={() => setTest('wilcoxon')}>Wilcoxon signed-rank</button>
        <button className={`chip ${test === 'kw' ? 'active' : ''}`} onClick={() => setTest('kw')}>Kruskal-Wallis</button>
      </div>
      {test === 'mann' && (
        <div className="pick-row">
          <Pick all={numeric} val={dv} set={setDv} label="Outcome (numeric)" />
          <Pick all={cats2} val={grp} set={setGrp} label="Grouping (2 levels)" />
        </div>
      )}
      {test === 'wilcoxon' && (
        <div className="pick-row">
          <Pick all={numeric} val={x} set={setX} label="Measure 1" />
          <Pick all={numeric} val={y} set={setY} label="Measure 2" />
        </div>
      )}
      {test === 'kw' && (
        <div className="pick-row">
          <Pick all={numeric} val={dv} set={setDv} label="Outcome (numeric)" />
          <Pick all={catNames} val={grp} set={setGrp} label="Factor (categorical, ≥ 2 levels)" />
        </div>
      )}
      {mwRes && (
        <>
          <div className="result-head">
            <span className="big-stat">U = {fmt(mwRes.u, 1)}</span>
            <span className="big-stat">z = {fmt(mwRes.z)}</span>
            <span className="big-stat">p = {fmtP(mwRes.p)}</span>
            <span className="big-stat">r = {fmt(mwRes.rankBiserial)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Group</th><th>N</th><th>Mean rank</th></tr></thead>
            <tbody>
              <tr><td>{mwRes.groups[0]}</td><td>{mwRes.n1}</td><td>{fmt(mwRes.meanRank1)}</td></tr>
              <tr><td>{mwRes.groups[1]}</td><td>{mwRes.n2}</td><td>{fmt(mwRes.meanRank2)}</td></tr>
            </tbody>
          </table>
          <div className="result-actions">
            <AIWriteup analysis="Mann-Whitney U test" result={mwRes} />
            <CaptureBtn onClick={() => onCapture({ kind: 'mann-whitney', result: mwRes })} />
          </div>
        </>
      )}
      {wilRes && (
        <>
          <div className="result-head">
            <span className="big-stat">W = {fmt(wilRes.w, 1)}</span>
            <span className="big-stat">z = {fmt(wilRes.z)}</span>
            <span className="big-stat">p = {fmtP(wilRes.p)}</span>
            <span className="big-stat">r = {fmt(wilRes.matchedR)}</span>
          </div>
          <div className="muted small">{wilRes.n} non-zero paired differences.</div>
          <div className="result-actions">
            <AIWriteup analysis="Wilcoxon signed-rank test" result={wilRes} />
            <CaptureBtn onClick={() => onCapture({ kind: 'wilcoxon', result: wilRes })} />
          </div>
        </>
      )}
      {kwRes && (
        <>
          <div className="result-head">
            <span className="big-stat">H({kwRes.df}) = {fmt(kwRes.h)}</span>
            <span className="big-stat">p = {fmtP(kwRes.p)}</span>
            <span className="big-stat">ε² = {fmt(kwRes.epsilonSquared, 3)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Group</th><th>N</th><th>Mean rank</th></tr></thead>
            <tbody>{kwRes.groups.map(g => <tr key={g.level}><td>{g.level}</td><td>{g.n}</td><td>{fmt(g.meanRank)}</td></tr>)}</tbody>
          </table>
          <div className="result-actions">
            <AIWriteup analysis="Kruskal-Wallis H test" result={kwRes} />
            <CaptureBtn onClick={() => onCapture({ kind: 'kruskal-wallis', result: kwRes })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Mediation ---------------------------------------------------------------
function Mediation({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
  const [x, setX] = useState(''); const [m, setM] = useState(''); const [y, setY] = useState('');
  let res = null;
  if (x && m && y && x !== m && m !== y && x !== y) {
    const { x: xa, m: ma, y: ya } = tripleComplete(cols[x], cols[m], cols[y]);
    if (xa.length >= 10) res = mediation(x, m, y, xa, ma, ya, 2000);
  }
  return (
    <div>
      <div className="pick-row">
        <Pick all={numeric} val={x} set={setX} label="X (independent)" />
        <Pick all={numeric.filter(v => v !== x)} val={m} set={setM} label="M (mediator)" />
        <Pick all={numeric.filter(v => v !== x && v !== m)} val={y} set={setY} label="Y (outcome)" />
      </div>
      <p className="muted small">PROCESS Model 4. 2,000 percentile-bootstrap resamples for the indirect-effect CI.</p>
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">a×b = {fmt(res.indirect, 3)}</span>
            <span className="big-stat">95% CI [{fmt(res.bootstrapCI95[0], 3)}, {fmt(res.bootstrapCI95[1], 3)}]</span>
            <span className="big-stat">Sobel z = {fmt(res.sobelZ)}, p = {fmtP(res.sobelP)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Path</th><th>b</th><th>SE</th><th>p</th></tr></thead>
            <tbody>
              <tr><td>a — X → M</td><td>{fmt(res.a, 3)}</td><td>{fmt(res.aSE, 3)}</td><td>{fmtP(res.aP)}</td></tr>
              <tr><td>b — M → Y | X</td><td>{fmt(res.b, 3)}</td><td>{fmt(res.bSE, 3)}</td><td>{fmtP(res.bP)}</td></tr>
              <tr><td>c′ — X → Y (direct)</td><td>{fmt(res.cPrime, 3)}</td><td>{fmt(res.cPrimeSE, 3)}</td><td>{fmtP(res.cPrimeP)}</td></tr>
              <tr><td>c — X → Y (total)</td><td>{fmt(res.c, 3)}</td><td>{fmt(res.cSE, 3)}</td><td>{fmtP(res.cP)}</td></tr>
            </tbody>
          </table>
          <div className="muted small">CI excludes zero ⇒ significant indirect effect. N = {res.n} complete cases.</div>
          <div className="result-actions">
            <AIWriteup analysis="mediation analysis (PROCESS Model 4)" result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'mediation', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Moderation --------------------------------------------------------------
function Moderation({ cols, numeric, onCapture }: { cols: Record<string, Cell[]>; numeric: string[]; onCapture: (e: ReportEntry) => void }) {
  const [x, setX] = useState(''); const [w, setW] = useState(''); const [y, setY] = useState('');
  let res = null;
  if (x && w && y && x !== w && w !== y && x !== y) {
    const { x: xa, m: wa, y: ya } = tripleComplete(cols[x], cols[w], cols[y]);
    if (xa.length >= 10) res = moderation(x, w, y, xa, wa, ya);
  }
  return (
    <div>
      <div className="pick-row">
        <Pick all={numeric} val={x} set={setX} label="X (focal predictor)" />
        <Pick all={numeric.filter(v => v !== x)} val={w} set={setW} label="W (moderator)" />
        <Pick all={numeric.filter(v => v !== x && v !== w)} val={y} set={setY} label="Y (outcome)" />
      </div>
      <p className="muted small">PROCESS Model 1. X and W mean-centred before forming the interaction term.</p>
      {res && (
        <>
          <div className="result-head">
            <span className="big-stat">b<sub>XW</sub> = {fmt(res.bXW, 3)}</span>
            <span className="big-stat">p = {fmtP(res.pXW)}</span>
            <span className="big-stat">R² = {fmt(res.r2, 3)}</span>
            <span className="big-stat">ΔR² = {fmt(res.r2Change, 3)}</span>
          </div>
          <table className="grid stats">
            <thead><tr><th>Term</th><th>b</th><th>SE</th><th>p</th></tr></thead>
            <tbody>
              <tr><td>{res.x}</td><td>{fmt(res.bX, 3)}</td><td>{fmt(res.seX, 3)}</td><td>{fmtP(res.pX)}</td></tr>
              <tr><td>{res.w}</td><td>{fmt(res.bW, 3)}</td><td>{fmt(res.seW, 3)}</td><td>{fmtP(res.pW)}</td></tr>
              <tr><td>{res.x} × {res.w}</td><td>{fmt(res.bXW, 3)}</td><td>{fmt(res.seXW, 3)}</td><td>{fmtP(res.pXW)}</td></tr>
            </tbody>
          </table>
          <div className="sub-label">Simple slopes of {res.y} on {res.x} at moderator levels</div>
          <table className="grid stats">
            <thead><tr><th>W level</th><th>W</th><th>Slope</th><th>SE</th><th>t</th><th>p</th></tr></thead>
            <tbody>{res.simpleSlopes.map((s, i) => (
              <tr key={i}><td>{s.wLevel}</td><td>{fmt(s.w, 2)}</td><td>{fmt(s.slope, 3)}</td><td>{fmt(s.se, 3)}</td><td>{fmt(s.t)}</td><td>{fmtP(s.p)}</td></tr>
            ))}</tbody>
          </table>
          <div className="result-actions">
            <AIWriteup analysis="moderation analysis (PROCESS Model 1)" result={res} />
            <CaptureBtn onClick={() => onCapture({ kind: 'moderation', result: res })} />
          </div>
        </>
      )}
    </div>
  );
}
