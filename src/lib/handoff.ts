// Cross-app handoffs.
//
// The Research Suite is one workflow split across apps. ToolsScope sits between
// Cadence (collect) and JournalTime (write). Once a user has run analyses and
// captured them for the report, they should be able to push that work straight
// into JournalTime's Article Developer as a pre-filled draft — so they don't
// re-type the Methods, Results, or the citations they need.
//
// Mechanism: base64-encoded JSON in the target URL hash. Static-site friendly,
// no server, no token, no auth — just a structured payload the receiver opens.

import type { ReportEntry, ReportMeta } from './report';
import { METHODS, ALWAYS_CITED, fullReferences } from './methodology';

export interface JournalTimePayload {
  source: 'toolsscope';
  v: 1;
  title: string;
  author: string;
  // The user's framing — left empty when ToolsScope doesn't know it yet.
  topic?: string;
  gap?: string;
  field?: string;
  method?: string;
  keywords?: string[];
  // Plain-text Methods + Results paragraphs the AI draft can pick up directly.
  // We keep it free-form so JournalTime doesn't need to know our schema.
  methodSummary: string;
  resultsSummary: string;
  references: string[];
  capturedAt: string;
}

function fmt(x: number, d = 2): string { return Number.isFinite(x) ? x.toFixed(d) : '—'; }
function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '—';
  return p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0/, '');
}

// Render one captured analysis as a plain-text Results sentence in APA tone.
// This is intentionally terse — JournalTime's AI step will expand it.
function entryToResultsLine(e: ReportEntry): string {
  switch (e.kind) {
    case 'descriptives': {
      const parts = e.rows.slice(0, 6).map(r => `${r.variable}: M = ${fmt(r.mean)}, SD = ${fmt(r.sd)} (n = ${r.n})`);
      return `Descriptive statistics — ${parts.join('; ')}.`;
    }
    case 'reliability':
      return `Reliability for ${e.result.items.length} items (${e.result.items.join(', ')}): Cronbach's α = ${fmt(e.result.alpha)}${e.result.omega != null ? `, ω = ${fmt(e.result.omega)}` : ''}.`;
    case 'correlation': {
      const method = e.result.method === 'spearman' ? 'Spearman ρ' : 'Pearson r';
      const stat = method.startsWith('Spearman') ? 'ρ' : 'r';
      const vars = e.result.vars;
      const cells: string[] = [];
      for (let i = 0; i < vars.length && cells.length < 6; i++) {
        for (let j = i + 1; j < vars.length && cells.length < 6; j++) {
          cells.push(`${vars[i]}–${vars[j]}: ${stat} = ${fmt(e.result.r[i][j])}, p = ${fmtP(e.result.p[i][j])}`);
        }
      }
      return `${method} correlations — ${cells.join('; ')}.`;
    }
    case 'ttest':
      return e.result.kind === 'independent'
        ? `Independent-samples t-test (${(e.result.groups ?? []).join(' vs. ')}): t(${fmt(e.result.df, 2)}) = ${fmt(e.result.t)}, p = ${fmtP(e.result.p)}, d = ${fmt(e.result.cohensD)}.`
        : `Paired t-test (${(e.result.groups ?? []).join(' vs. ')}): t(${fmt(e.result.df)}) = ${fmt(e.result.t)}, p = ${fmtP(e.result.p)}, d = ${fmt(e.result.cohensD)}.`;
    case 'anova':
      return `One-way ANOVA, ${e.result.dv} by ${e.result.factor}: F(${e.result.dfBetween}, ${e.result.dfWithin}) = ${fmt(e.result.fStat)}, p = ${fmtP(e.result.p)}, η² = ${fmt(e.result.etaSquared)}.`;
    case 'regression':
      return `Multiple regression predicting ${e.result.dv} from ${e.result.predictors.join(', ')}: R² = ${fmt(e.result.r2)}, adj. R² = ${fmt(e.result.adjR2)}, F(${e.result.dfModel}, ${e.result.dfResid}) = ${fmt(e.result.fStat)}, p = ${fmtP(e.result.pModel)}.`;
    case 'chisquare':
      return `Chi-square test of independence (${e.result.rowVar} × ${e.result.colVar}): χ²(${e.result.df}) = ${fmt(e.result.chi2)}, p = ${fmtP(e.result.p)}, Cramér's V = ${fmt(e.result.cramersV)}.`;
    case 'factor':
      return `${e.result.method.toUpperCase()} on ${e.result.items.length} items extracted ${e.result.nFactors} factor${e.result.nFactors === 1 ? '' : 's'} (KMO = ${fmt(e.result.kmo)}, Bartlett p = ${fmtP(e.result.bartlettP)}).`;
    case 'mann-whitney':
      return `Mann-Whitney U (${e.result.groups.join(' vs. ')}): U = ${fmt(e.result.u, 1)}, z = ${fmt(e.result.z)}, p = ${fmtP(e.result.p)}.`;
    case 'wilcoxon':
      return `Wilcoxon signed-rank (${e.result.vars.join(' vs. ')}): W = ${fmt(e.result.w, 1)}, z = ${fmt(e.result.z)}, p = ${fmtP(e.result.p)}.`;
    case 'kruskal-wallis':
      return `Kruskal-Wallis (${e.result.dv} by ${e.result.factor}): H(${e.result.df}) = ${fmt(e.result.h)}, p = ${fmtP(e.result.p)}.`;
    case 'mediation':
      return `Mediation (${e.result.x} → ${e.result.m} → ${e.result.y}): indirect effect ab = ${fmt(e.result.indirect)}, 95% CI [${fmt(e.result.bootstrapCI95[0])}, ${fmt(e.result.bootstrapCI95[1])}], Sobel z = ${fmt(e.result.sobelZ)}, p = ${fmtP(e.result.sobelP)}.`;
    case 'moderation':
      return `Moderation (${e.result.x} × ${e.result.w} → ${e.result.y}): interaction b = ${fmt(e.result.bXW)}, p = ${fmtP(e.result.pXW)}, ΔR² = ${fmt(e.result.r2Change)}.`;
    case 'qual': {
      const totals = e.project.docs.reduce((s, d) => s + d.text.length, 0);
      return `Qualitative coding: ${e.project.docs.length} document${e.project.docs.length === 1 ? '' : 's'} (${totals.toLocaleString()} chars), ${e.project.codes.length} codes, ${e.project.spans.length} coded spans.`;
    }
  }
}

function entryToMethodLine(e: ReportEntry): string | null {
  const id = (() => {
    switch (e.kind) {
      case 'descriptives': return 'descriptives';
      case 'reliability': return 'reliability';
      case 'correlation': return e.result.method === 'spearman' ? 'correlation_spearman' : 'correlation_pearson';
      case 'ttest': return e.result.kind === 'independent' ? 'ttest_independent' : 'ttest_paired';
      case 'anova': return 'anova';
      case 'regression': return 'regression';
      case 'chisquare': return 'chisquare';
      case 'factor': return e.result.method === 'pca' ? 'factor_pca' : 'factor_efa';
      case 'mann-whitney': return 'mann_whitney';
      case 'wilcoxon': return 'wilcoxon';
      case 'kruskal-wallis': return 'kruskal_wallis';
      case 'mediation': return 'mediation';
      case 'moderation': return 'moderation';
      case 'qual': return 'qual_coding';
    }
  })();
  const m = METHODS[id];
  return m ? `${m.name}: ${m.whenToUse}` : null;
}

export function buildJournalTimePayload(entries: ReportEntry[], meta: ReportMeta, opts?: {
  topic?: string; gap?: string; field?: string; keywords?: string[];
}): JournalTimePayload {
  const methodLines = [...new Set(entries.map(entryToMethodLine).filter(Boolean) as string[])];
  const resultsLines = entries.map(entryToResultsLine);
  const methodSummary = [
    `Data were analyzed in ToolsScope (Ahmed, 2026), an in-browser analysis workbench. The dataset comprised ${meta.n} cases on ${meta.variables} variables (source: ${meta.dataset}).`,
    ...methodLines.map(s => `• ${s}`),
  ].join('\n');
  const resultsSummary = resultsLines.map(s => `• ${s}`).join('\n');

  // Same reference resolution the .docx export uses, so JournalTime sees the
  // same citations a user would paste into a paper.
  const methodIds = [...new Set(entries.flatMap(e => {
    const k = entryToMethodLine(e); return k ? [(/^[A-Z][^:]+/.exec(k)?.[0] ?? '').toLowerCase()] : [];
  }))];
  void methodIds;
  const keys = new Set<string>(ALWAYS_CITED);
  for (const e of entries) {
    const k = (() => { switch (e.kind) {
      case 'descriptives': return 'descriptives';
      case 'reliability': return 'reliability';
      case 'correlation': return e.result.method === 'spearman' ? 'correlation_spearman' : 'correlation_pearson';
      case 'ttest': return e.result.kind === 'independent' ? 'ttest_independent' : 'ttest_paired';
      case 'anova': return 'anova';
      case 'regression': return 'regression';
      case 'chisquare': return 'chisquare';
      case 'factor': return e.result.method === 'pca' ? 'factor_pca' : 'factor_efa';
      case 'mann-whitney': return 'mann_whitney';
      case 'wilcoxon': return 'wilcoxon';
      case 'kruskal-wallis': return 'kruskal_wallis';
      case 'mediation': return 'mediation';
      case 'moderation': return 'moderation';
      case 'qual': return 'qual_coding';
    } })();
    const m = METHODS[k]; if (!m) continue;
    m.primary.forEach(c => keys.add(c));
    (m.supporting ?? []).forEach(c => keys.add(c));
  }
  const references = fullReferences([...keys]).map((c: { full: string }) => c.full);

  return {
    source: 'toolsscope',
    v: 1,
    title: meta.title,
    author: meta.author,
    topic: opts?.topic,
    gap: opts?.gap,
    field: opts?.field,
    keywords: opts?.keywords,
    methodSummary,
    resultsSummary,
    references,
    capturedAt: new Date().toISOString(),
  };
}

// URL-safe base64 of a JSON payload, used as the JournalTime fragment.
function toBase64Url(s: string): string {
  // utf-8 safe via TextEncoder; works in modern browsers (Vercel target).
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The single public entry point — opens JournalTime in a new tab with the
// captured analysis ready for the Article Developer.
export function sendToJournalTime(payload: JournalTimePayload, opts?: { baseUrl?: string }) {
  const json = JSON.stringify(payload);
  const b64 = toBase64Url(json);
  const base = opts?.baseUrl ?? 'https://syahmedu.github.io/journaltime/';
  const url = `${base}#tools=${b64}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
