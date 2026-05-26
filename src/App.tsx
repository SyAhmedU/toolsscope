import { useEffect, useState } from 'react';
import SyedBar from './components/SyedBar';
import DataPanel from './components/DataPanel';
import Analyze from './components/Analyze';
import Visualize from './components/Visualize';
import Qual from './components/Qual';
import type { Dataset } from './lib/types';
import { loadDataset, saveDataset, clearDataset } from './lib/store';
import { loadQualProject } from './lib/qual';
import type { ReportEntry, ReportMeta } from './lib/report';
import { buildReport, downloadBlob } from './lib/report';

type Tab = 'data' | 'analyze' | 'visualize' | 'qual';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(() => loadDataset());
  const [tab, setTab] = useState<Tab>('data');
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [reportTitle, setReportTitle] = useState('Untitled study');
  const [reportAuthor, setReportAuthor] = useState('');
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (dataset) saveDataset(dataset); else clearDataset();
  }, [dataset]);

  function update(d: Dataset | null) {
    setDataset(d);
    if (d) setTab('analyze');
  }
  function addEntry(e: ReportEntry) {
    // Dedup: keep most recent of each (kind, key) so the user can re-run an
    // analysis and have the new numbers replace the old in the report.
    const key = JSON.stringify({ k: e.kind, h: keyFor(e) });
    setEntries(prev => [...prev.filter(p => JSON.stringify({ k: p.kind, h: keyFor(p) }) !== key), e]);
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

        {tab === 'data' && <DataPanel dataset={dataset} onChange={update} />}
        {tab === 'analyze' && dataset && <Analyze dataset={dataset} onCapture={addEntry} />}
        {tab === 'visualize' && dataset && <Visualize dataset={dataset} />}
        {tab === 'qual' && <Qual />}
        {(tab === 'analyze' || tab === 'visualize') && !dataset && <div className="empty-hint"><p>Load a dataset first (Data tab).</p></div>}
      </div>
    </>
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
