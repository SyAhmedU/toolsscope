// Suggestions — the test recommender's user-facing surface.
//
// On dataset load we profile every variable (skew, kurt, missingness, levels…)
// and surface ranked analysis recommendations with an honest reason and cited
// rationale. Each recommendation has a "Run this →" button that switches to
// the Analyze tab with the right section + variables pre-selected, so the user
// can click once and see results, or expand "Why?" to read the methodology
// case before committing.

import { useMemo, useState } from 'react';
import type { Dataset } from '../lib/types';
import { profileDataset } from '../lib/recommender';
import type { Recommendation } from '../lib/recommender';
import { METHODS, CITATIONS } from '../lib/methodology';
import type { ResearchPack } from '../lib/researchpack';
import { isPlannedTest } from '../lib/researchpack';

export interface SuggestionsApi {
  /** Switches the Analyze tab and applies the preset. */
  onRun: (rec: Recommendation) => void;
}

export default function Suggestions({ dataset, onRun, pack }: { dataset: Dataset; onRun: SuggestionsApi['onRun']; pack?: ResearchPack | null }) {
  const report = useMemo(() => profileDataset(dataset), [dataset]);
  const [open, setOpen] = useState(true);
  // When a ResearchPack is loaded, sort planned tests to the top — the user's
  // upstream plan trumps the data-driven priority for ordering. Within each
  // group the recommender's priority still wins.
  const allRecs = useMemo(() => {
    if (!pack?.analysis?.tests?.length) return report.recommendations;
    return [...report.recommendations].sort((a, b) => {
      const ap = isPlannedTest(pack, a.methodId) ? 0 : 1;
      const bp = isPlannedTest(pack, b.methodId) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.priority - a.priority;
    });
  }, [report.recommendations, pack]);
  const top = allRecs.slice(0, 8);
  if (top.length === 0 && report.warnings.length === 0) return null;
  const plannedCount = pack ? top.filter(r => isPlannedTest(pack, r.methodId)).length : 0;
  return (
    <section className={`suggest ${open ? 'open' : ''}`}>
      <header className="suggest-head">
        <button className="suggest-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="suggest-chev">{open ? '▾' : '▸'}</span>
          <span className="suggest-title">Suggested analyses</span>
          <span className="muted small">
            {top.length} recommendation{top.length === 1 ? '' : 's'} based on your data
            {plannedCount > 0 && ` · ${plannedCount} from your plan`}
          </span>
        </button>
      </header>
      {open && (
        <>
          {report.warnings.length > 0 && (
            <ul className="suggest-warnings">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          <ol className="suggest-list">
            {top.map(r => <SuggestionRow key={r.id} rec={r} onRun={onRun} planned={pack ? isPlannedTest(pack, r.methodId) : false} />)}
          </ol>
        </>
      )}
    </section>
  );
}

function SuggestionRow({ rec, onRun, planned }: { rec: Recommendation; onRun: (r: Recommendation) => void; planned: boolean }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const m = METHODS[rec.methodId];
  return (
    <li className={`suggest-row ${planned ? 'suggest-row-planned' : ''}`}>
      <div className="suggest-row-head">
        {planned && <span className="suggest-planned-pill" title="This test was in your ResearchFlow plan">📦 Planned</span>}
        <span className="suggest-badge">{m?.name ?? rec.methodId}</span>
        <span className="suggest-row-title">{rec.title}</span>
        <button className="btn primary suggest-run" onClick={() => onRun(rec)}>Run this →</button>
      </div>
      <div className="suggest-reason">
        {rec.reason}
        <button className="suggest-why" onClick={() => setWhyOpen(o => !o)}>{whyOpen ? 'Hide methodology' : 'Methodology & citations'}</button>
      </div>
      {whyOpen && m && (
        <div className="suggest-why-panel">
          <div><strong>When to use:</strong> {m.whenToUse}</div>
          <div><strong>Report as:</strong> <code className="method-template">{m.reportingTemplate}</code></div>
          <div>
            <strong>Citations:</strong>
            <ul>
              {[...m.primary, ...(m.supporting ?? [])].map(k => (
                <li key={k}><em>{CITATIONS[k]?.inline}</em> — {CITATIONS[k]?.full}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}
