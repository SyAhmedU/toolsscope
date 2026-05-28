import { useEffect, useState } from 'react';
import SyedBar from './components/SyedBar';
import Plan from './components/Plan';
import DataPanel from './components/DataPanel';
import Analyze from './components/Analyze';
import Visualize from './components/Visualize';
import Qual from './components/Qual';
import Suggestions from './components/Suggestions';
import type { Dataset } from './lib/types';
import { loadDataset, saveDataset, clearDataset } from './lib/store';
import { loadQualProject } from './lib/qual';
import type { ReportEntry, ReportMeta } from './lib/report';
import { buildReport, downloadBlob } from './lib/report';
import type { AnalyzePreset, Recommendation } from './lib/recommender';
import { buildJournalTimePayload, sendToJournalTime } from './lib/handoff';
import { buildDatasetFromCadence, isCadenceJson } from './lib/parse';
import type { ResearchPack } from './lib/researchpack';
import { decodeResearchPack, saveResearchPack, loadResearchPack, clearResearchPack } from './lib/researchpack';

type Tab = 'plan' | 'data' | 'analyze' | 'visualize' | 'qual';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(() => loadDataset());
  const [tab, setTab] = useState<Tab>('plan');
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [reportTitle, setReportTitle] = useState('Untitled study');
  const [reportAuthor, setReportAuthor] = useState('');
  const [building, setBuilding] = useState(false);
  const [preset, setPreset] = useState<AnalyzePreset | null>(null);
  const [researchPack, setResearchPack] = useState<ResearchPack | null>(() => loadResearchPack());

  useEffect(() => {
    if (dataset) saveDataset(dataset); else clearDataset();
  }, [dataset]);

  // Inbound handoffs. ToolsScope accepts up to two simultaneous fragments in
  // the URL hash:
  //   #pack=<b64>     — ResearchPack from researchflow (or forwarded by cadence)
  //   #cadence=<b64>  — Cadence study aggregate responses
  // When both are present (Cadence Analytics → ToolsScope after the user came
  // through researchflow), the pack arrives alongside the data so planned
  // tests still highlight. We handle them in one effect so the hash-clear at
  // the end doesn't race the two consumers.
  useEffect(() => {
    const hash = location.hash;
    let touched = false;
    try {
      const pm = hash.match(/[#&]pack=([^&]+)/);
      if (pm) {
        const pack = decodeResearchPack(pm[1]);
        if (pack) {
          saveResearchPack(pack);
          setResearchPack(pack);
          setReportTitle(prev => (prev === 'Untitled study' && pack.title) ? pack.title : prev);
          touched = true;
        }
      }
    } catch (e) { console.warn('ResearchPack handoff failed:', e); }
    try {
      const cm = hash.match(/[#&]cadence=([^&]+)/);
      if (cm) {
        const pad = '='.repeat((4 - (cm[1].length % 4)) % 4);
        const norm = cm[1].replace(/-/g, '+').replace(/_/g, '/') + pad;
        const bin = atob(norm);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const json = new TextDecoder().decode(bytes);
        if (isCadenceJson(json)) {
          const ds = buildDatasetFromCadence(json, 'Cadence study (via handoff)');
          setDataset(ds);
          setTab('analyze');
          touched = true;
        }
      }
    } catch (e) { console.warn('Cadence handoff failed:', e); }
    if (touched) history.replaceState(null, '', location.pathname + location.search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(d: Dataset | null) {
    setDataset(d);
    if (d) setTab('analyze');
  }
  function runRecommendation(rec: Recommendation) {
    setPreset(rec.preset);
    setTab('analyze');
  }
  function addEntry(e: ReportEntry) {
    // Dedup: keep most recent of each (kind, key) so the user can re-run an
    // analysis and have the new numbers replace the old in the report.
    const key = JSON.stringify({ k: e.kind, h: keyFor(e) });
    setEntries(prev => [...prev.filter(p => JSON.stringify({ k: p.kind, h: keyFor(p) }) !== key), e]);
  }

  function handoffToJournalTime() {
    const all: ReportEntry[] = [...entries];
    const qp = loadQualProject();
    if ((qp.docs.length || qp.codes.length) && !all.some(e => e.kind === 'qual')) all.push({ kind: 'qual', project: qp });
    if (all.length === 0) {
      alert('Capture at least one analysis (or qualitative project) before sending to JournalTime.');
      return;
    }
    const meta: ReportMeta = {
      title: reportTitle || 'Untitled study',
      author: reportAuthor || 'ToolsScope user',
      dataset: dataset?.name ?? '(no quantitative dataset)',
      n: dataset?.rows.length ?? 0,
      variables: dataset?.variables.length ?? 0,
    };
    // Carry the ResearchPack's framing into JournalTime so the Article
    // Developer opens with topic / gap / field / keywords already filled.
    const payload = buildJournalTimePayload(all, meta, {
      topic: reportTitle || researchPack?.title || researchPack?.question,
      gap: researchPack?.gap,
      field: researchPack?.field,
      keywords: researchPack?.keywords,
    });
    sendToJournalTime(payload);
  }

  function dismissPack() {
    clearResearchPack();
    setResearchPack(null);
  }

  async function exportReport() {
    setBuilding(true);
    try {
      const all: ReportEntry[] = [...entries];
      const qp = loadQualProject();
      if ((qp.docs.length || qp.codes.length) && !all.some(e => e.kind === 'qual')) all.push({ kind: 'qual', project: qp });
      const meta: ReportMeta = {
        title: reportTitle || 'Untitled study',
        author: reportAuthor || 'ToolsScope user',
        dataset: dataset?.name ?? '(no quantitative dataset)',
        n: dataset?.rows.length ?? 0,
        variables: dataset?.variables.length ?? 0,
      };
      const blob = await buildReport(meta, all);
      downloadBlob(blob, `${(meta.title || 'toolsscope-report').replace(/[^a-z0-9\-]+/gi, '_')}.docx`);
    } catch (err) {
      console.error(err);
      alert('Could not build the Word report. See the console for details.');
    } finally {
      setBuilding(false);
    }
  }

  const tabs: { key: Tab; label: string; enabled: boolean }[] = [
    { key: 'plan', label: '✨ Plan', enabled: true },
    { key: 'data', label: 'Data', enabled: true },
    { key: 'analyze', label: 'Analyze', enabled: !!dataset },
    { key: 'visualize', label: 'Visualize', enabled: !!dataset },
    { key: 'qual', label: 'Qualitative', enabled: true },
  ];

  return (
    <>
      <SyedBar />
      <div className="app">
        <header className="hero">
          <h1>ToolsScope</h1>
          <p className="sub">
            The analysis bench of the research suite. Bring in cleaned data — a Cadence export or any CSV/Excel —
            and run the analyses and figures you actually report in papers: descriptives, reliability, correlations,
            t-tests, ANOVA, regression, factor analysis, nonparametric tests, mediation, moderation — and the qualitative
            module for coding text. Everything runs in your browser; nothing is uploaded.
          </p>
          <p className="suite-link">
            Suite flow: <a href="https://syahmedu.github.io/cadence/" target="_blank" rel="noreferrer">Cadence</a> collects →
            <strong> ToolsScope</strong> analyzes → <a href="https://syahmedu.github.io/journaltime/" target="_blank" rel="noreferrer">JournalTime</a> writes.
          </p>
        </header>

        <div className="report-bar">
          <input className="cell-input" placeholder="Report title" value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
          <input className="cell-input" placeholder="Author" value={reportAuthor} onChange={e => setReportAuthor(e.target.value)} />
          <span className="muted small">{entries.length} analysis{entries.length === 1 ? '' : 'es'} captured</span>
          <button className="btn primary" onClick={exportReport} disabled={building}>
            {building ? 'Building…' : '⬇ Export Word report'}
          </button>
          <button className="btn" onClick={handoffToJournalTime} title="Open JournalTime with this study's Methods + Results pre-filled">
            ✍ Send to JournalTime
          </button>
          {entries.length > 0 && (
            <button className="btn ghost" onClick={() => setEntries([])}>Clear captured</button>
          )}
        </div>

        <nav className="tabs">
          {tabs.map(t => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} disabled={!t.enabled}>
              {t.label}
            </button>
          ))}
        </nav>

        {researchPack && <ResearchPackBanner pack={researchPack} onDismiss={dismissPack} />}
        {dataset && <Suggestions dataset={dataset} onRun={runRecommendation} pack={researchPack} />}

        {tab === 'plan' && <Plan datasetReady={!!dataset} />}
        {tab === 'data' && <DataPanel dataset={dataset} onChange={update} />}
        {tab === 'analyze' && dataset && <Analyze dataset={dataset} onCapture={addEntry} preset={preset} onPresetApplied={() => setPreset(null)} />}
        {tab === 'visualize' && dataset && <Visualize dataset={dataset} />}
        {tab === 'qual' && <Qual />}
        {(tab === 'analyze' || tab === 'visualize') && !dataset && <div className="empty-hint"><p>Load a dataset first (Data tab).</p></div>}
      </div>
    </>
  );
}

// Small banner shown above Suggestions when a ResearchPack is loaded. Tells
// the user where the plan came from + summarises what got carried + lets them
// dismiss the pack (which also clears localStorage so it doesn't persist into
// the next unrelated session).
function ResearchPackBanner({ pack, onDismiss }: { pack: ResearchPack; onDismiss: () => void }) {
  const planned = pack.analysis?.tests?.length ?? 0;
  return (
    <section className="rp-banner">
      <div className="rp-banner-icon">📦</div>
      <div className="rp-banner-body">
        <div className="rp-banner-title">Plan carried from ResearchFlow</div>
        <div className="rp-banner-meta">
          {pack.question && <span><strong>Question:</strong> {pack.question.slice(0, 120)}{pack.question.length > 120 ? '…' : ''}</span>}
          {pack.theory?.name && <span><strong>Framework:</strong> {pack.theory.name}</span>}
          {planned > 0 && <span><strong>{planned} planned analys{planned === 1 ? 'is' : 'es'}</strong> highlighted below</span>}
        </div>
      </div>
      <button className="rp-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
    </section>
  );
}

// Identifier so re-running the same analysis on the same inputs replaces the
// captured entry instead of duplicating it.
function keyFor(e: ReportEntry): string {
  switch (e.kind) {
    case 'descriptives': return e.rows.map(r => r.variable).join(',');
    case 'reliability': return e.result.items.join(',');
    case 'correlation': return `${e.result.method}|${e.result.vars.join(',')}`;
    case 'ttest': return `${e.result.kind}|${e.result.groups?.join(',') ?? ''}`;
    case 'anova': return `${e.result.dv}~${e.result.factor}`;
    case 'regression': return `${e.result.dv}~${e.result.predictors.join('+')}`;
    case 'chisquare': return `${e.result.rowVar}x${e.result.colVar}`;
    case 'factor': return `${e.result.method}|${e.result.items.join(',')}`;
    case 'mann-whitney': return `${e.result.groups.join(',')}`;
    case 'wilcoxon': return `${e.result.vars.join(',')}`;
    case 'kruskal-wallis': return `${e.result.dv}~${e.result.factor}`;
    case 'mediation': return `${e.result.x}>${e.result.m}>${e.result.y}`;
    case 'moderation': return `${e.result.x}*${e.result.w}>${e.result.y}`;
    case 'qual': return 'qual';
  }
}
