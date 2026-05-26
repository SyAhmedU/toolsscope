// Methodology-aware UI primitives.
//
// `MethodologyCard` sits above each analysis section showing When-to-use,
// assumptions, the literal APA reporting template, and the primary
// citations — so the user never runs a test "for the sake of running it",
// and always knows exactly what to report and whom to cite.
//
// `EffectSizeChip` annotates a numeric effect-size value (d, η², r, V, …)
// with its Cohen-style benchmark band — "negligible / small / medium / large"
// — and the source of the benchmark.

import { useState } from 'react';
import type { Methodology } from '../lib/methodology';
import { CITATIONS, benchmark } from '../lib/methodology';

export function MethodologyCard({ m, defaultOpen = true }: { m: Methodology; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`method-card ${open ? 'open' : ''}`}>
      <button className="method-toggle" onClick={() => setOpen(o => !o)}>
        <span className="method-chev" aria-hidden>{open ? '▾' : '▸'}</span>
        <span className="method-name">{m.name}</span>
        <span className="method-cite">{m.primary.map(k => CITATIONS[k]?.inline ?? k).join('; ')}</span>
      </button>
      {open && (
        <div className="method-body">
          <div className="method-row">
            <span className="method-label">When to use</span>
            <span>{m.whenToUse}</span>
          </div>
          {m.assumptions.length > 0 && (
            <div className="method-row">
              <span className="method-label">Assumptions</span>
              <ul className="method-bullets">{m.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
          <div className="method-row">
            <span className="method-label">Report as</span>
            <code className="method-template">{m.reportingTemplate}</code>
          </div>
          {(m.primary.length > 0 || (m.supporting?.length ?? 0) > 0) && (
            <div className="method-row">
              <span className="method-label">Citations</span>
              <ul className="method-refs">
                {m.primary.map(k => <li key={k}><strong>{CITATIONS[k]?.inline}</strong> — {CITATIONS[k]?.full}</li>)}
                {(m.supporting ?? []).map(k => <li key={k}>{CITATIONS[k]?.inline} — {CITATIONS[k]?.full}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EffectSizeChip({ value, m }: { value: number; m: Methodology | undefined }) {
  if (!m?.effectSizes?.length || !Number.isFinite(value)) return null;
  const b = m.effectSizes[0];
  const band = benchmark(value, b);
  if (!band) return null;
  return <span className={`es-chip es-${band}`}>{band} <span className="es-cite">({CITATIONS[b.sourceKey]?.inline})</span></span>;
}
