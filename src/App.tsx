import { useEffect, useState } from 'react';
import SyedBar from './components/SyedBar';
import DataPanel from './components/DataPanel';
import Analyze from './components/Analyze';
import Visualize from './components/Visualize';
import type { Dataset } from './lib/types';
import { loadDataset, saveDataset, clearDataset } from './lib/store';

type Tab = 'data' | 'analyze' | 'visualize';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(() => loadDataset());
  const [tab, setTab] = useState<Tab>('data');

  useEffect(() => {
    if (dataset) saveDataset(dataset); else clearDataset();
  }, [dataset]);

  function update(d: Dataset | null) {
    setDataset(d);
    if (d) setTab('analyze');
  }

  return (
    <>
      <SyedBar />
      <div className="app">
        <header className="hero">
          <h1>ToolsScope</h1>
          <p className="sub">
            The analysis bench of the research suite. Bring in cleaned data — a Cadence export or any CSV/Excel —
            and run the analyses and figures you actually report in papers: descriptives, reliability, correlations,
            t-tests, ANOVA, regression, and the charts that go with them. Everything runs in your browser; nothing is uploaded.
          </p>
          <p className="suite-link">
            Suite flow: <a href="https://syahmedu.github.io/cadence/" target="_blank" rel="noreferrer">Cadence</a> collects →
            <strong> ToolsScope</strong> analyzes → <a href="https://syahmedu.github.io/journaltime/" target="_blank" rel="noreferrer">JournalTime</a> writes.
          </p>
        </header>

        <nav className="tabs">
          {(['data', 'analyze', 'visualize'] as Tab[]).map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
              disabled={t !== 'data' && !dataset}>
              {t === 'data' ? 'Data' : t === 'analyze' ? 'Analyze' : 'Visualize'}
            </button>
          ))}
        </nav>

        {tab === 'data' && <DataPanel dataset={dataset} onChange={update} />}
        {tab === 'analyze' && dataset && <Analyze dataset={dataset} />}
        {tab === 'visualize' && dataset && <Visualize dataset={dataset} />}
        {tab !== 'data' && !dataset && <div className="empty-hint"><p>Load a dataset first (Data tab).</p></div>}
      </div>
    </>
  );
}
