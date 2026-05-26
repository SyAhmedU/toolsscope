// Qualitative analysis panel — the in-browser alternative to NVivo/Atlas.ti/MAXQDA
// for the things researchers actually report in qual papers:
//   - load text documents (paste, or upload .txt)
//   - highlight-and-code (inductive coding) with optional themes
//   - code frequency + cross-document spread
//   - code × code co-occurrence
//   - word frequency (stop-word filtered)
//   - quick sentiment estimate (transparent lexicon)
//
// Project state persists in localStorage so a coding session survives reloads.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { QualCode, QualDoc, QualProject } from '../lib/types';
import {
  loadQualProject, saveQualProject, newCode, applyCode, removeSpan,
  wordFrequency, codeFrequency, coOccurrence, themeRollup, sentimentScore,
} from '../lib/qual';

export default function Qual() {
  const [project, setProject] = useState<QualProject>(() => loadQualProject());
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeCodeId, setActiveCodeId] = useState<string | null>(null);
  const [tab, setTab] = useState<'docs' | 'codes' | 'analyze'>('docs');

  useEffect(() => { saveQualProject(project); }, [project]);
  useEffect(() => {
    if (!activeDocId && project.docs.length) setActiveDocId(project.docs[0].id);
    if (!activeCodeId && project.codes.length) setActiveCodeId(project.codes[0].id);
  }, [project, activeDocId, activeCodeId]);

  const activeDoc = project.docs.find(d => d.id === activeDocId) || null;
  const activeCode = project.codes.find(c => c.id === activeCodeId) || null;
  const docSpans = activeDoc ? project.spans.filter(s => s.docId === activeDoc.id) : [];

  return (
    <div>
      <p className="muted small">
        ToolsScope's qualitative module — an open, in-browser stand-in for NVivo/Atlas.ti/MAXQDA. Paste or upload text, code inductively, then run frequency, co-occurrence, and theme analysis. Everything stays in your browser.
      </p>

      <div className="seg">
        <button className={`seg-btn ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>Documents & coding</button>
        <button className={`seg-btn ${tab === 'codes' ? 'active' : ''}`} onClick={() => setTab('codes')} disabled={project.codes.length === 0 && project.docs.length === 0}>Codebook</button>
        <button className={`seg-btn ${tab === 'analyze' ? 'active' : ''}`} onClick={() => setTab('analyze')} disabled={project.docs.length === 0}>Analyze</button>
      </div>

      {tab === 'docs' && (
        <DocsAndCoding
          project={project} setProject={setProject}
          activeDoc={activeDoc} setActiveDocId={setActiveDocId}
          activeCode={activeCode} setActiveCodeId={setActiveCodeId}
          docSpans={docSpans}
        />
      )}
      {tab === 'codes' && <Codebook project={project} setProject={setProject} />}
      {tab === 'analyze' && <QualAnalyze project={project} />}
    </div>
  );
}

// ---- Documents & inline coding -----------------------------------------------
function DocsAndCoding({
  project, setProject, activeDoc, setActiveDocId, activeCode, setActiveCodeId, docSpans,
}: {
  project: QualProject; setProject: (p: QualProject) => void;
  activeDoc: QualDoc | null; setActiveDocId: (id: string | null) => void;
  activeCode: QualCode | null; setActiveCodeId: (id: string) => void;
  docSpans: { docId: string; start: number; end: number; codeId: string; text: string }[];
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [newCodeLabel, setNewCodeLabel] = useState('');
  const [newCodeTheme, setNewCodeTheme] = useState('');
  const textRef = useRef<HTMLDivElement | null>(null);

  function addDoc(name: string, text: string) {
    const id = `d${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setProject({ ...project, docs: [...project.docs, { id, name: name || `Document ${project.docs.length + 1}`, text }] });
    setActiveDocId(id);
  }
  function addCode(label: string, theme?: string) {
    const base = newCode(label, theme?.trim() || undefined);
    let unique = base.id, i = 2;
    while (project.codes.some(c => c.id === unique)) { unique = `${base.id}-${i++}`; }
    setProject({ ...project, codes: [...project.codes, { ...base, id: unique }] });
    setActiveCodeId(unique);
  }
  function applySelection() {
    if (!activeDoc || !activeCode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!textRef.current?.contains(range.commonAncestorContainer)) return;
    const pre = document.createRange();
    pre.selectNodeContents(textRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + sel.toString().length;
    if (end - start < 2) return;
    setProject(applyCode(project, { docId: activeDoc.id, start, end, codeId: activeCode.id }));
    sel.removeAllRanges();
  }
  function removeDoc(id: string) {
    if (!confirm('Remove this document and all its codings?')) return;
    setProject({
      ...project,
      docs: project.docs.filter(d => d.id !== id),
      spans: project.spans.filter(s => s.docId !== id),
    });
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(txt => addDoc(file.name.replace(/\.[^.]+$/, ''), txt));
    e.target.value = '';
  }

  return (
    <div className="qual-grid">
      <aside className="qual-sidebar">
        <div className="sub-label">Documents</div>
        <ul className="qual-doclist">
          {project.docs.map(d => (
            <li key={d.id} className={activeDoc?.id === d.id ? 'active' : ''}>
              <button className="link-btn" onClick={() => setActiveDocId(d.id)}>{d.name}</button>
              <button className="x-btn" onClick={() => removeDoc(d.id)} title="Remove">×</button>
            </li>
          ))}
        </ul>
        <div className="qual-actions">
          <button className="btn ghost" onClick={() => setPasteOpen(o => !o)}>{pasteOpen ? 'Cancel' : '+ Paste text'}</button>
          <label className="btn ghost">
            + Upload .txt
            <input type="file" accept=".txt,text/plain" onChange={onFile} hidden />
          </label>
        </div>
        {pasteOpen && (
          <div className="qual-paste">
            <input placeholder="Document name (e.g. P03 interview)" value={pasteName} onChange={e => setPasteName(e.target.value)} />
            <textarea rows={6} placeholder="Paste transcript or notes here…" value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <button className="btn" disabled={!pasteText.trim()} onClick={() => { addDoc(pasteName, pasteText); setPasteText(''); setPasteName(''); setPasteOpen(false); }}>Add document</button>
          </div>
        )}

        <div className="sub-label" style={{ marginTop: 16 }}>Codebook</div>
        <ul className="qual-codelist">
          {project.codes.map(c => (
            <li key={c.id} className={activeCode?.id === c.id ? 'active' : ''} style={{ borderLeftColor: c.color }}>
              <button className="link-btn" onClick={() => setActiveCodeId(c.id)}>
                <span className="code-dot" style={{ background: c.color }} /> {c.label}
                {c.theme && <span className="muted small"> · {c.theme}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="qual-paste">
          <input placeholder="New code label" value={newCodeLabel} onChange={e => setNewCodeLabel(e.target.value)} />
          <input placeholder="Theme (optional)" value={newCodeTheme} onChange={e => setNewCodeTheme(e.target.value)} />
          <button className="btn" disabled={!newCodeLabel.trim()} onClick={() => { addCode(newCodeLabel.trim(), newCodeTheme.trim()); setNewCodeLabel(''); setNewCodeTheme(''); }}>+ Add code</button>
        </div>
      </aside>

      <section className="qual-main">
        {activeDoc ? (
          <>
            <div className="qual-toolbar">
              <strong>{activeDoc.name}</strong>
              <span className="muted small">Select text in the document, then click “Apply code”.</span>
              <button className="btn" disabled={!activeCode} onClick={applySelection}>
                {activeCode ? `Apply: ${activeCode.label}` : 'Pick a code first'}
              </button>
            </div>
            <div className="qual-doc" ref={textRef}>{renderWithSpans(activeDoc.text, docSpans, project.codes)}</div>
            <div className="sub-label">Coded excerpts in this document</div>
            {docSpans.length === 0 ? (
              <div className="muted small">No coded passages yet.</div>
            ) : (
              <table className="grid stats">
                <thead><tr><th>Code</th><th>Excerpt</th><th /></tr></thead>
                <tbody>{docSpans.map((s, i) => {
                  const c = project.codes.find(cc => cc.id === s.codeId);
                  const globalIdx = project.spans.findIndex(sp => sp === s);
                  return (
                    <tr key={i}>
                      <td><span className="code-dot" style={{ background: c?.color || '#999' }} /> {c?.label}</td>
                      <td><em>“{s.text}”</em></td>
                      <td><button className="x-btn" onClick={() => setProject(removeSpan(project, globalIdx))} title="Remove">×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </>
        ) : (
          <div className="empty-hint"><p>Add a document on the left to start coding.</p></div>
        )}
      </section>
    </div>
  );
}

// Render text with highlighted spans.
function renderWithSpans(
  text: string,
  spans: { start: number; end: number; codeId: string }[],
  codes: QualCode[],
): React.ReactNode[] {
  if (spans.length === 0) return [text];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const codeColor = (id: string) => codes.find(c => c.id === id)?.color || '#ddd';
  const codeLabel = (id: string) => codes.find(c => c.id === id)?.label || id;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(
      <mark key={i} style={{ background: codeColor(s.codeId) + '33', borderBottom: `2px solid ${codeColor(s.codeId)}`, padding: '0 2px' }} title={codeLabel(s.codeId)}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

// ---- Codebook tab ------------------------------------------------------------
function Codebook({ project, setProject }: { project: QualProject; setProject: (p: QualProject) => void }) {
  const freq = useMemo(() => codeFrequency(project), [project]);
  function editLabel(id: string, label: string) {
    setProject({ ...project, codes: project.codes.map(c => c.id === id ? { ...c, label } : c) });
  }
  function editTheme(id: string, theme: string) {
    setProject({ ...project, codes: project.codes.map(c => c.id === id ? { ...c, theme: theme || undefined } : c) });
  }
  function delCode(id: string) {
    if (!confirm('Delete this code and all its applied excerpts?')) return;
    setProject({
      ...project,
      codes: project.codes.filter(c => c.id !== id),
      spans: project.spans.filter(s => s.codeId !== id),
    });
  }
  return (
    <table className="grid stats">
      <thead><tr><th></th><th>Code</th><th>Theme</th><th>Count</th><th>Docs</th><th /></tr></thead>
      <tbody>{project.codes.map(c => {
        const f = freq.find(r => r.code === c.id);
        return (
          <tr key={c.id}>
            <td><span className="code-dot" style={{ background: c.color }} /></td>
            <td><input className="cell-input" value={c.label} onChange={e => editLabel(c.id, e.target.value)} /></td>
            <td><input className="cell-input" value={c.theme || ''} onChange={e => editTheme(c.id, e.target.value)} placeholder="(unthemed)" /></td>
            <td>{f?.count ?? 0}</td>
            <td>{f?.docs ?? 0}</td>
            <td><button className="x-btn" onClick={() => delCode(c.id)} title="Delete">×</button></td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

// ---- Analysis tab ------------------------------------------------------------
function QualAnalyze({ project }: { project: QualProject }) {
  const words = useMemo(() => wordFrequency(project.docs, 30), [project.docs]);
  const codeFreq = useMemo(() => codeFrequency(project), [project]);
  const coocs = useMemo(() => coOccurrence(project).slice(0, 25), [project]);
  const themes = useMemo(() => themeRollup(project), [project]);
  const sentiments = useMemo(() => project.docs.map(d => ({ name: d.name, ...sentimentScore(d.text) })), [project.docs]);

  return (
    <div className="qual-analyze">
      <section>
        <h3>Code frequency</h3>
        {codeFreq.length === 0 ? <p className="muted">No codes yet.</p> : (
          <table className="grid stats">
            <thead><tr><th>Code</th><th>Theme</th><th>Count</th><th>Docs</th></tr></thead>
            <tbody>{codeFreq.map(r => (
              <tr key={r.code}><td>{r.label}</td><td>{r.theme || <span className="muted">(unthemed)</span>}</td><td>{r.count}</td><td>{r.docs}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Themes</h3>
        {themes.length === 0 ? <p className="muted">Assign a theme to one or more codes to see a roll-up.</p> : (
          <table className="grid stats">
            <thead><tr><th>Theme</th><th>Codes</th><th>Total excerpts</th></tr></thead>
            <tbody>{themes.map(t => (
              <tr key={t.theme}><td>{t.theme}</td><td>{t.codes.join(', ')}</td><td>{t.count}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Code co-occurrence (same-document)</h3>
        {coocs.length === 0 ? <p className="muted">No co-occurring codes yet.</p> : (
          <table className="grid stats">
            <thead><tr><th>Code A</th><th>Code B</th><th>Co-occur</th></tr></thead>
            <tbody>{coocs.map((c, i) => <tr key={i}><td>{c.a}</td><td>{c.b}</td><td>{c.count}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Word frequency (top 30, stop-words removed)</h3>
        {words.length === 0 ? <p className="muted">Add documents to see a word-frequency profile.</p> : (
          <table className="grid stats">
            <thead><tr><th>Word</th><th>Count</th><th>Documents</th></tr></thead>
            <tbody>{words.map(w => <tr key={w.word}><td>{w.word}</td><td>{w.count}</td><td>{w.docs}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Sentiment estimate (per document)</h3>
        <p className="muted small">Transparent lexicon-based estimate. Useful for triangulation, not a substitute for human coding.</p>
        {sentiments.length === 0 ? <p className="muted">No documents.</p> : (
          <table className="grid stats">
            <thead><tr><th>Document</th><th>Tokens</th><th>+ score</th><th>− score</th><th>Net</th></tr></thead>
            <tbody>{sentiments.map((s, i) => <tr key={i}><td>{s.name}</td><td>{s.tokens}</td><td>{s.positive}</td><td>{s.negative}</td><td>{s.score}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
