// ToolsScope qualitative analysis engine.
// Lightweight, pure-functional, browser-only replacements for the things
// researchers actually report from NVivo / Atlas.ti / MAXQDA in papers:
//   - inductive coding (highlight-and-code) with grouping into themes
//   - code frequency + cross-document spread
//   - code × code co-occurrence (used to build code networks)
//   - word frequency with stop-word removal
//   - a transparent lexicon-based sentiment estimate (AFINN-style; not a
//     replacement for human coding, but useful for triangulation)
//
// Data shapes live in lib/types.ts. Nothing here touches the network — the
// whole qual module runs in-browser, like every other ToolsScope analysis.

import type { QualProject, QualCode, QualSpan, WordFreqRow, CodeFreqRow, CoocCell } from './types';

const STOPWORDS = new Set<string>([
  'a','about','above','after','again','against','all','am','an','and','any','are',
  'as','at','be','because','been','before','being','below','between','both','but',
  'by','could','did','do','does','doing','down','during','each','few','for','from',
  'further','had','has','have','having','he','her','here','hers','herself','him',
  'himself','his','how','i','if','in','into','is','it','its','itself','just','me',
  'more','most','my','myself','no','nor','not','now','of','off','on','once','only',
  'or','other','our','ours','ourselves','out','over','own','same','she','should',
  'so','some','such','than','that','the','their','theirs','them','themselves',
  'then','there','these','they','this','those','through','to','too','under','until',
  'up','very','was','we','were','what','when','where','which','while','who','whom',
  'why','will','with','would','you','your','yours','yourself','yourselves','also',
  'like','really','one','two','three','get','got','going','go','said','say','says',
  'thing','things','something','someone','anything','everything','nothing',
]);

// Minimal AFINN-ish lexicon (Public-domain word list, condensed). Positive → +n, negative → −n.
// Deliberately small + transparent — it is for surface triangulation, not the final word.
const SENTIMENT_LEX: Record<string, number> = {
  good: 3, great: 3, excellent: 4, wonderful: 4, love: 4, like: 2, enjoy: 3,
  happy: 3, helpful: 3, useful: 3, easy: 2, fast: 2, smooth: 2, nice: 2,
  positive: 2, success: 3, successful: 3, support: 2, supportive: 3, clear: 2,
  effective: 3, efficient: 3, satisfied: 3, satisfaction: 3, beautiful: 3,
  amazing: 4, awesome: 4, brilliant: 4, perfect: 4, fantastic: 4, win: 2,
  bad: -3, awful: -4, terrible: -4, hate: -4, dislike: -2, sad: -2, angry: -3,
  frustrated: -3, frustrating: -3, slow: -2, hard: -2, difficult: -2,
  confusing: -3, confused: -2, broken: -3, useless: -3, poor: -2,
  problem: -2, problems: -2, issue: -1, issues: -1, fail: -3, failed: -3,
  failure: -3, struggle: -2, struggling: -2, stress: -2, stressful: -3,
  worry: -2, worried: -2, painful: -3, annoying: -3, disappointing: -3,
  never: -1, no: -1, not: -1,
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .split(/[^a-z0-9]+/i)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

export function wordFrequency(docs: { id: string; text: string }[], topN = 50): WordFreqRow[] {
  const total = new Map<string, number>();
  const docCount = new Map<string, Set<string>>();
  for (const d of docs) {
    const seen = new Set<string>();
    for (const tok of tokenize(d.text)) {
      total.set(tok, (total.get(tok) ?? 0) + 1);
      seen.add(tok);
    }
    for (const tok of seen) {
      if (!docCount.has(tok)) docCount.set(tok, new Set());
      docCount.get(tok)!.add(d.id);
    }
  }
  return [...total.entries()]
    .map(([word, count]) => ({ word, count, docs: docCount.get(word)?.size ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function codeFrequency(project: QualProject): CodeFreqRow[] {
  const counts = new Map<string, { count: number; docs: Set<string> }>();
  for (const c of project.codes) counts.set(c.id, { count: 0, docs: new Set() });
  for (const s of project.spans) {
    const slot = counts.get(s.codeId);
    if (slot) { slot.count++; slot.docs.add(s.docId); }
  }
  return project.codes.map(c => ({
    code: c.id,
    label: c.label,
    theme: c.theme,
    count: counts.get(c.id)!.count,
    docs: counts.get(c.id)!.docs.size,
  })).sort((a, b) => b.count - a.count);
}

// Code × code co-occurrence: how often two codes appear in the same document.
export function coOccurrence(project: QualProject): CoocCell[] {
  const perDoc = new Map<string, Set<string>>();
  for (const s of project.spans) {
    if (!perDoc.has(s.docId)) perDoc.set(s.docId, new Set());
    perDoc.get(s.docId)!.add(s.codeId);
  }
  const cellMap = new Map<string, number>();
  for (const codes of perDoc.values()) {
    const arr = [...codes].sort();
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const key = `${arr[i]}|${arr[j]}`;
      cellMap.set(key, (cellMap.get(key) ?? 0) + 1);
    }
  }
  const lookup = new Map(project.codes.map(c => [c.id, c.label] as const));
  return [...cellMap.entries()]
    .map(([k, count]) => { const [a, b] = k.split('|'); return { a: lookup.get(a) ?? a, b: lookup.get(b) ?? b, count }; })
    .sort((p, q) => q.count - p.count);
}

export function themeRollup(project: QualProject): { theme: string; codes: string[]; count: number }[] {
  const groups = new Map<string, { codes: Set<string>; count: number }>();
  const codeCount = new Map<string, number>();
  for (const s of project.spans) codeCount.set(s.codeId, (codeCount.get(s.codeId) ?? 0) + 1);
  for (const c of project.codes) {
    const theme = c.theme?.trim() || '(unthemed)';
    if (!groups.has(theme)) groups.set(theme, { codes: new Set(), count: 0 });
    const g = groups.get(theme)!;
    g.codes.add(c.label);
    g.count += codeCount.get(c.id) ?? 0;
  }
  return [...groups.entries()]
    .map(([theme, g]) => ({ theme, codes: [...g.codes].sort(), count: g.count }))
    .sort((a, b) => b.count - a.count);
}

export function sentimentScore(text: string): { score: number; positive: number; negative: number; tokens: number } {
  const toks = tokenize(text);
  let pos = 0, neg = 0;
  for (const t of toks) {
    const w = SENTIMENT_LEX[t];
    if (w == null) continue;
    if (w > 0) pos += w; else neg += w;
  }
  return { score: pos + neg, positive: pos, negative: neg, tokens: toks.length };
}

export function newCode(label: string, theme?: string): QualCode {
  // Stable readable id; collisions resolved at the caller by appending an index.
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `code-${Date.now()}`;
  const palette = ['#FF9656', '#F14575', '#9270F4', '#22d3ee', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];
  // Hash label → palette index for stable colours.
  let h = 0; for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return { id, label, color: palette[h % palette.length], theme };
}

export function applyCode(project: QualProject, span: Omit<QualSpan, 'text'>): QualProject {
  const doc = project.docs.find(d => d.id === span.docId);
  if (!doc) return project;
  const text = doc.text.slice(span.start, span.end);
  return { ...project, spans: [...project.spans, { ...span, text }] };
}

export function removeSpan(project: QualProject, index: number): QualProject {
  return { ...project, spans: project.spans.filter((_, i) => i !== index) };
}

export const QUAL_STORAGE_KEY = 'toolsscope_qual_project_v1';
export function loadQualProject(): QualProject {
  try {
    const raw = localStorage.getItem(QUAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { docs: [], codes: [], spans: [] };
}
export function saveQualProject(p: QualProject) {
  try { localStorage.setItem(QUAL_STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
