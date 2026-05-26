// Data view — bring data in (upload CSV/XLSX, paste, or load the demo), see the
// detected variables and their types, override a type if detection got it wrong,
// and preview the rows. Everything downstream reads from this Dataset.

import { useRef, useState } from 'react';
import type { Dataset, VarType } from '../lib/types';
import { parseDelimited, parseXlsx, buildDataset } from '../lib/parse';
import { buildDemo } from '../lib/demo';

const TYPES: VarType[] = ['numeric', 'likert', 'categorical', 'text', 'id'];
const TYPE_COLOR: Record<VarType, string> = {
  numeric: 'var(--accent-warm-b)', likert: 'var(--accent-warm-c)', categorical: 'var(--good)', text: 'var(--ink-mute)', id: 'var(--ink-mute)',
};

export default function DataPanel({ dataset, onChange }: { dataset: Dataset | null; onChange: (d: Dataset | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');

  async function onFile(f: File) {
    setErr('');
    try {
      if (/\.xlsx?$/i.test(f.name)) {
        const buf = await f.arrayBuffer();
        onChange(buildDataset(await parseXlsx(buf), f.name.replace(/\.[^.]+$/, ''), 'upload'));
      } else {
        const text = await f.text();
        onChange(buildDataset(parseDelimited(text), f.name.replace(/\.[^.]+$/, ''), 'upload'));
      }
    } catch (e) { setErr(String((e as Error).message || e)); }
  }

  function loadPaste() {
    setErr('');
    try {
      if (!paste.trim()) return;
      onChange(buildDataset(parseDelimited(paste), 'Pasted data', 'paste'));
    } catch (e) { setErr(String((e as Error).message || e)); }
  }

  function setVarType(name: string, type: VarType) {
    if (!dataset) return;
    onChange({ ...dataset, variables: dataset.variables.map(v => (v.name === name ? { ...v, type } : v)) });
  }

  return (
    <div>
      <div className="data-actions">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>⬆ Upload CSV / Excel</button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <button className="btn" onClick={() => onChange(buildDemo())}>Load demo dataset</button>
        {dataset && <button className="btn ghost" onClick={() => onChange(null)}>Clear</button>}
      </div>

      <details className="paste-box">
        <summary>…or paste data (CSV / TSV)</summary>
        <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={6}
          placeholder={'id,jobsat,engage\n1,5,6\n2,4,4'} />
        <button className="btn" onClick={loadPaste}>Use pasted data</button>
      </details>

      {err && <div className="error">⚠ {err}</div>}

      {!dataset && (
        <div className="empty-hint">
          <p>No data loaded. Upload a cleaned CSV/Excel file (e.g. a Cadence export), paste a table, or load the demo to explore every analysis.</p>
        </div>
      )}

      {dataset && (
        <>
          <div className="ds-head">
            <strong>{dataset.name}</strong>
            <span className="muted"> · {dataset.rows.length} rows · {dataset.variables.length} variables</span>
          </div>

          <div className="var-grid">
            {dataset.variables.map(v => (
              <div className="var-chip" key={v.name}>
                <span className="var-name">{v.name}</span>
                <select value={v.type} onChange={e => setVarType(v.name, e.target.value as VarType)} style={{ color: TYPE_COLOR[v.type] }}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {v.missing > 0 && <span className="var-missing">{v.missing} missing</span>}
                {v.type === 'likert' && v.likertMin != null && <span className="var-meta">{v.likertMin}–{v.likertMax}</span>}
                {v.type === 'categorical' && v.levels && <span className="var-meta">{v.levels.length} levels</span>}
              </div>
            ))}
          </div>

          <div className="preview-wrap">
            <table className="grid">
              <thead><tr>{dataset.variables.map(v => <th key={v.name}>{v.name}</th>)}</tr></thead>
              <tbody>
                {dataset.rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>{dataset.variables.map(v => <td key={v.name}>{r[v.name] === null ? <span className="na">·</span> : String(r[v.name])}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {dataset.rows.length > 12 && <div className="muted preview-more">… {dataset.rows.length - 12} more rows</div>}
          </div>
        </>
      )}
    </div>
  );
}
