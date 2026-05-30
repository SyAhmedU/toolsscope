// Power analysis for a two-group (independent) t-test. Normal-approximation
// formulas (Cohen 1988) on the verified qnorm/normalCdf in stats.ts — very
// close to exact noncentral-t (G*Power) for n ≳ 20, slightly conservative.
// Labeled as an approximation so nothing is over-claimed.
import { useMemo, useState } from 'react';
import { tTestPowerTwoSample, tTestRequiredN } from '../lib/stats';

type Mode = 'n' | 'power';

export default function PowerAnalysis() {
  const [mode, setMode] = useState<Mode>('n');
  const [d, setD] = useState(0.5);
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [nPerGroup, setN] = useState(64);

  const out = useMemo(() => {
    if (!(d > 0)) return null;
    if (mode === 'n') {
      const n = tTestRequiredN(d, power, alpha);
      return { n, total: n * 2 };
    }
    const pw = tTestPowerTwoSample(d, nPerGroup, alpha);
    return { power: pw };
  }, [mode, d, alpha, power, nPerGroup]);

  const band = d < 0.35 ? 'small' : d < 0.65 ? 'medium' : 'large';

  return (
    <div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Sample size and power for comparing <strong>two independent groups</strong> (t-test) on a
        standardized mean difference (Cohen's <em>d</em>). Normal approximation — within ~1 of the
        exact noncentral-t (G*Power) for n ≳ 20, and slightly conservative.
      </p>

      <div className="inline-toggle" style={{ marginBottom: 14 }}>
        <button className={`chip ${mode === 'n' ? 'active' : ''}`} onClick={() => setMode('n')}>Find sample size</button>
        <button className={`chip ${mode === 'power' ? 'active' : ''}`} onClick={() => setMode('power')}>Find power</button>
      </div>

      <div className="pick-row">
        <div>
          <div className="pick-label">Effect size (Cohen's d)</div>
          <input type="number" step="0.05" min="0.05" value={d} onChange={e => setD(Number(e.target.value))}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg-elev)', width: 120 }} />
          <div className="pick-chips" style={{ marginTop: 6 }}>
            <button className="chip" onClick={() => setD(0.2)}>0.2 small</button>
            <button className="chip" onClick={() => setD(0.5)}>0.5 medium</button>
            <button className="chip" onClick={() => setD(0.8)}>0.8 large</button>
          </div>
        </div>
        <div>
          <div className="pick-label">α (two-tailed)</div>
          <select value={alpha} onChange={e => setAlpha(Number(e.target.value))}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg-elev)' }}>
            <option value={0.05}>.05</option>
            <option value={0.01}>.01</option>
            <option value={0.10}>.10</option>
          </select>
        </div>
        {mode === 'n' ? (
          <div>
            <div className="pick-label">Target power (1 − β)</div>
            <select value={power} onChange={e => setPower(Number(e.target.value))}
              style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg-elev)' }}>
              <option value={0.80}>.80</option>
              <option value={0.90}>.90</option>
              <option value={0.95}>.95</option>
            </select>
          </div>
        ) : (
          <div>
            <div className="pick-label">n per group</div>
            <input type="number" step="1" min="2" value={nPerGroup} onChange={e => setN(Math.max(2, Math.round(Number(e.target.value))))}
              style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg-elev)', width: 120 }} />
          </div>
        )}
      </div>

      {out && (
        <div className="result-head" style={{ marginTop: 20 }}>
          {mode === 'n' && 'n' in out ? (
            <div>
              <div className="big-stat" style={{ fontSize: 22 }}>{out.n} per group <span style={{ fontWeight: 400, fontSize: 14 }}>({out.total} total)</span></div>
              <div className="muted small">to detect a {band} effect (d = {d}) at α = {alpha}, power = {power}.</div>
            </div>
          ) : 'power' in out ? (
            <div>
              <div className="big-stat" style={{ fontSize: 22 }}>{(out.power! * 100).toFixed(1)}% power</div>
              <div className="muted small">
                with {nPerGroup} per group ({nPerGroup * 2} total) to detect a {band} effect (d = {d}) at α = {alpha}.
                {out.power! < 0.8 ? ' Under-powered — increase n.' : ' Adequately powered (≥ .80).'}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 16 }}>
        Effect-size bands: small d ≈ 0.2, medium ≈ 0.5, large ≈ 0.8 (Cohen, 1988). Assumes equal
        group sizes, a two-tailed test, and roughly equal variances. For exact noncentral-t values,
        cross-check in G*Power.
      </p>
    </div>
  );
}
