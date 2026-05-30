// Meta-analysis — pool published effect sizes (study-level summary data,
// not the row dataset). Inverse-variance fixed + DerSimonian–Laird random
// effects, heterogeneity (Q, I², τ²), and a forest plot. Math lives in
// stats.ts (verified against hand calcs). Nothing here is invented: the
// only bundled example is explicitly SIMULATED.
import { useMemo, useState } from 'react';
import { metaAnalysis, type MetaStudy, fmtP } from '../lib/stats';

type Uncertainty = 'se' | 'variance';

// Clearly-labeled SIMULATED studies (not a real meta-analysis) so the tool
// is usable instantly without implying real data.
const EXAMPLE = `Study A (sim), 0.20, 0.10
Study B (sim), 0.45, 0.12
Study C (sim), 0.30, 0.09
Study D (sim), 0.55, 0.15
Study E (sim), 0.38, 0.08`;

interface ParsedRow { label: string; effect: number; unc: number }

function parseStudies(text: string): { rows: ParsedRow[]; errors: number } {
  let errors = 0;
  const rows: ParsedRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,\t]/).map(s => s.trim());
    if (parts.length < 3) { errors++; continue; }
    const effect = Number(parts[parts.length - 2]);
    const unc = Number(parts[parts.length - 1]);
    const label = parts.slice(0, parts.length - 2).join(', ') || `Study ${rows.length + 1}`;
    if (!Number.isFinite(effect) || !Number.isFinite(unc) || unc <= 0) { errors++; continue; }
    rows.push({ label, effect, unc });
  }
  return { rows, errors };
}

export default function MetaAnalysis() {
  const [text, setText] = useState('');
  const [unc, setUnc] = useState<Uncertainty>('se');
  const [metricLabel, setMetricLabel] = useState('Effect size');
  const [ran, setRan] = useState(false);

  const parsed = useMemo(() => parseStudies(text), [text]);
  const studies: MetaStudy[] = useMemo(
    () => parsed.rows.map(r => ({ label: r.label, yi: r.effect, vi: unc === 'se' ? r.unc * r.unc : r.unc })),
    [parsed, unc],
  );
  const result = useMemo(() => (ran && studies.length >= 2 ? metaAnalysis(studies) : null), [ran, studies]);

  // Forest-plot scale across all study CIs + both pooled CIs + the null line.
  const plot = useMemo(() => {
    if (!result) return null;
    const se = (vi: number) => Math.sqrt(vi);
    const rows = studies.map((s, i) => ({
      label: s.label, yi: s.yi,
      lo: s.yi - 1.96 * se(s.vi), hi: s.yi + 1.96 * se(s.vi),
      w: result.weights[i].wRandomPct,
    }));
    const lows = [...rows.map(r => r.lo), result.fixed.ciLow, result.random.ciLow, 0];
    const highs = [...rows.map(r => r.hi), result.fixed.ciHigh, result.random.ciHigh, 0];
    const min = Math.min(...lows), max = Math.max(...highs);
    const pad = (max - min) * 0.08 || 0.1;
    return { rows, min: min - pad, max: max + pad };
  }, [result, studies]);

  function PooledCard({ title, p }: { title: string; p: ReturnType<typeof metaAnalysis>['fixed'] }) {
    return (
      <div className="pick" style={{ minWidth: 220 }}>
        <div className="pick-label">{title}</div>
        <div className="big-stat">{p.estimate.toFixed(3)} <span style={{ fontWeight: 400, fontSize: 13 }}>[{p.ciLow.toFixed(3)}, {p.ciHigh.toFixed(3)}]</span></div>
        <div className="muted small">z = {p.z.toFixed(2)} · p {fmtP(p.p)}</div>
      </div>
    );
  }

  const W = 560, rowH = 26, padL = 150, padR = 96, padT = 8;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Pool effect sizes from multiple studies. Enter one study per line as
        <code> label, effect, {unc === 'se' ? 'SE' : 'variance'}</code> — same metric across studies
        (e.g. all Cohen's <em>d</em>, or all <em>r</em>). Computes fixed-effect and
        random-effects (DerSimonian–Laird) pooled estimates with heterogeneity.
      </p>

      <div className="pick-row" style={{ marginBottom: 10 }}>
        <div>
          <div className="pick-label">Uncertainty column</div>
          <div className="inline-toggle">
            <button className={`chip ${unc === 'se' ? 'active' : ''}`} onClick={() => setUnc('se')}>Standard error</button>
            <button className={`chip ${unc === 'variance' ? 'active' : ''}`} onClick={() => setUnc('variance')}>Variance</button>
          </div>
        </div>
        <div>
          <div className="pick-label">Metric label (axis)</div>
          <input className="cell-input" value={metricLabel} onChange={e => setMetricLabel(e.target.value)} style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg-elev)' }} />
        </div>
      </div>

      <textarea
        value={text} onChange={e => { setText(e.target.value); setRan(false); }}
        rows={6}
        placeholder={`Smith 2019, 0.34, 0.08\nJones 2020, 0.41, 0.11\n…`}
        style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-elev)', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
      />
      <div className="data-actions" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={() => setRan(true)} disabled={parsed.rows.length < 2}>Run meta-analysis</button>
        <button className="btn" onClick={() => { setText(EXAMPLE); setRan(false); }}>Load simulated example</button>
        <span className="muted small" style={{ alignSelf: 'center' }}>
          {parsed.rows.length} valid stud{parsed.rows.length === 1 ? 'y' : 'ies'}{parsed.errors ? ` · ${parsed.errors} line(s) skipped` : ''}
        </span>
      </div>

      {ran && studies.length < 2 && <div className="warn-box">Enter at least two valid studies (label, effect, {unc}).</div>}

      {result && plot && (
        <>
          <div className="result-head" style={{ marginTop: 18 }}>
            <PooledCard title="Random-effects pooled" p={result.random} />
            <PooledCard title="Fixed-effect pooled" p={result.fixed} />
          </div>
          <div className="sub-label">Heterogeneity</div>
          <p className="muted small">
            Q({result.dfQ}) = {result.Q.toFixed(2)}, p {fmtP(result.Qp)} ·
            I² = {result.I2.toFixed(1)}% ·
            τ² = {result.tau2.toFixed(4)}
            {result.I2 >= 75 ? ' · high heterogeneity — prefer the random-effects estimate' : result.I2 >= 50 ? ' · moderate heterogeneity' : ' · low heterogeneity'}
          </p>

          <div className="sub-label">Forest plot</div>
          <div style={{ overflowX: 'auto' }}>
            <svg width={W} height={padT * 2 + rowH * (plot.rows.length + 2)} role="img" aria-label="Forest plot of study effects">
              {(() => {
                const x = (v: number) => padL + ((v - plot.min) / (plot.max - plot.min)) * (W - padL - padR);
                const els: React.ReactNode[] = [];
                // null line at 0 (if in range)
                if (0 >= plot.min && 0 <= plot.max) {
                  els.push(<line key="null" x1={x(0)} x2={x(0)} y1={padT} y2={padT + rowH * (plot.rows.length + 2)} stroke="var(--line)" strokeDasharray="3 3" />);
                }
                plot.rows.forEach((r, i) => {
                  const cy = padT + rowH * i + rowH / 2;
                  const sq = 4 + (r.w / 100) * 10;
                  els.push(<line key={`ci${i}`} x1={x(r.lo)} x2={x(r.hi)} y1={cy} y2={cy} stroke="var(--ink-mute)" strokeWidth={1.5} />);
                  els.push(<rect key={`pt${i}`} x={x(r.yi) - sq / 2} y={cy - sq / 2} width={sq} height={sq} fill="var(--accent-warm-b)" />);
                  els.push(<text key={`lb${i}`} x={6} y={cy + 4} fontSize={11} fill="var(--ink-soft)">{r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label}</text>);
                  els.push(<text key={`vl${i}`} x={W - padR + 6} y={cy + 4} fontSize={11} fill="var(--ink-mute)">{r.yi.toFixed(2)}</text>);
                });
                // pooled diamonds
                const diamond = (est: number, lo: number, hi: number, cy: number, color: string, label: string) => {
                  const cx = x(est);
                  els.push(<polygon key={`d${label}`} points={`${x(lo)},${cy} ${cx},${cy - 7} ${x(hi)},${cy} ${cx},${cy + 7}`} fill={color} />);
                  els.push(<text key={`dl${label}`} x={6} y={cy + 4} fontSize={11} fontWeight={700} fill="var(--ink)">{label}</text>);
                  els.push(<text key={`dv${label}`} x={W - padR + 6} y={cy + 4} fontSize={11} fontWeight={700} fill="var(--ink)">{est.toFixed(2)}</text>);
                };
                diamond(result.random.estimate, result.random.ciLow, result.random.ciHigh, padT + rowH * plot.rows.length + rowH / 2, 'var(--accent-warm-b)', 'Random');
                diamond(result.fixed.estimate, result.fixed.ciLow, result.fixed.ciHigh, padT + rowH * (plot.rows.length + 1) + rowH / 2, 'var(--accent-warm-c)', 'Fixed');
                return els;
              })()}
              <text x={padL} y={padT * 2 + rowH * (plot.rows.length + 2) - 2} fontSize={10} fill="var(--ink-mute)">{metricLabel}</text>
            </svg>
          </div>

          <div className="sub-label">Per-study weights</div>
          <table className="stats">
            <thead><tr><th>Study</th><th>{metricLabel}</th><th>Variance</th><th>Fixed wt %</th><th>Random wt %</th></tr></thead>
            <tbody>
              {result.weights.map((w, i) => (
                <tr key={i}><td>{w.label}</td><td>{w.yi.toFixed(3)}</td><td>{w.vi.toFixed(4)}</td><td>{w.wFixedPct.toFixed(1)}</td><td>{w.wRandomPct.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>

          <p className="muted small" style={{ marginTop: 14 }}>
            Fixed-effect = inverse-variance weighting (assumes one true effect). Random-effects adds
            between-study variance τ² (DerSimonian &amp; Laird, 1986) — use it when I² indicates real
            heterogeneity. Methods: Borenstein, Hedges, Higgins &amp; Rothstein (2009),
            <em> Introduction to Meta-Analysis</em>.
          </p>
        </>
      )}
    </div>
  );
}
