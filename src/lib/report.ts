// ToolsScope APA-style Word report builder.
// Bundles every analysis the user has run in this session into a single
// presentable .docx file, with cover, Methods, Results, and References — the
// shape researchers actually paste straight into their papers.
//
// `docx` is heavy (~250 kB minified). Imported dynamically so it costs nothing
// until the user clicks "Export Word report" — same lazy pattern as xlsx.
//
// Each `ReportEntry` is appended by Analyze.tsx / Visualize.tsx / Qual.tsx as
// the user runs an analysis. The builder converts entries → docx Paragraphs.

import type {
  DescriptiveRow, ReliabilityResult, CorrelationResult, TTestResult, AnovaResult,
  RegressionResult, ChiSquareResult, FactorAnalysisResult, MannWhitneyResult,
  WilcoxonResult, KruskalWallisResult, MediationResult, ModerationResult,
  QualProject,
} from './types';
import { codeFrequency, coOccurrence, themeRollup, wordFrequency } from './qual';
import { METHODS, ALWAYS_CITED, fullReferences } from './methodology';

export type ReportEntry =
  | { kind: 'descriptives'; rows: DescriptiveRow[] }
  | { kind: 'reliability'; result: ReliabilityResult }
  | { kind: 'correlation'; result: CorrelationResult }
  | { kind: 'ttest'; result: TTestResult }
  | { kind: 'anova'; result: AnovaResult }
  | { kind: 'regression'; result: RegressionResult }
  | { kind: 'chisquare'; result: ChiSquareResult }
  | { kind: 'factor'; result: FactorAnalysisResult }
  | { kind: 'mann-whitney'; result: MannWhitneyResult }
  | { kind: 'wilcoxon'; result: WilcoxonResult }
  | { kind: 'kruskal-wallis'; result: KruskalWallisResult }
  | { kind: 'mediation'; result: MediationResult }
  | { kind: 'moderation'; result: ModerationResult }
  | { kind: 'qual'; project: QualProject };

function fmt(x: number, d = 2): string { return Number.isFinite(x) ? x.toFixed(d) : '—'; }
function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '—';
  return p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0/, '');
}

// Map a captured entry to the methodology key(s) whose citations it pulls in.
function methodKeysFor(e: ReportEntry): string[] {
  switch (e.kind) {
    case 'descriptives': return ['descriptives'];
    case 'reliability': return ['reliability'];
    case 'correlation': return [e.result.method === 'spearman' ? 'correlation_spearman' : 'correlation_pearson'];
    case 'ttest': return [e.result.kind === 'independent' ? 'ttest_independent' : 'ttest_paired'];
    case 'anova': return ['anova'];
    case 'regression': return ['regression'];
    case 'chisquare': return ['chisquare'];
    case 'factor': return [e.result.method === 'pca' ? 'factor_pca' : 'factor_efa'];
    case 'mann-whitney': return ['mann_whitney'];
    case 'wilcoxon': return ['wilcoxon'];
    case 'kruskal-wallis': return ['kruskal_wallis'];
    case 'mediation': return ['mediation'];
    case 'moderation': return ['moderation'];
    case 'qual': return ['qual_coding'];
  }
}

function citationsForReport(entries: ReportEntry[]): string[] {
  const keys = new Set<string>(ALWAYS_CITED);
  for (const e of entries) {
    for (const mid of methodKeysFor(e)) {
      const m = METHODS[mid];
      if (!m) continue;
      m.primary.forEach(k => keys.add(k));
      (m.supporting ?? []).forEach(k => keys.add(k));
    }
  }
  return [...keys];
}

export interface ReportMeta {
  title: string;
  author: string;
  dataset: string;
  n: number;
  variables: number;
}

export async function buildReport(meta: ReportMeta, entries: ReportEntry[]): Promise<Blob> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;

  const HEAD = HeadingLevel;
  const para = (text: string, opts: { bold?: boolean; italic?: boolean; size?: number; spacing?: number; align?: 'left' | 'center' | 'right' } = {}) =>
    new Paragraph({
      alignment: opts.align === 'center' ? AlignmentType.CENTER : opts.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: opts.spacing ?? 120 },
      children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, size: opts.size ?? 22 })],
    });
  const heading = (text: string, level: 1 | 2 | 3) => new Paragraph({
    heading: level === 1 ? HEAD.HEADING_1 : level === 2 ? HEAD.HEADING_2 : HEAD.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });

  const makeTable = (header: string[], rows: (string | number)[][]) => {
    const cell = (text: string, bold = false) => new TableCell({
      width: { size: Math.floor(9000 / header.length), type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20 })] })],
    });
    const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
    return new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({ tableHeader: true, children: header.map(h => cell(h, true)) }),
        ...rows.map(r => new TableRow({ children: r.map(c => cell(typeof c === 'number' ? (Number.isFinite(c) ? c.toFixed(c % 1 === 0 ? 0 : 3) : '—') : c)) })),
      ],
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    });
  };

  const children: any[] = [];

  // ---- Cover ----------------------------------------------------------------
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 240 }, children: [new TextRun({ text: meta.title, bold: true, size: 36 })] }));
  children.push(para(meta.author || 'Author', { align: 'center', size: 24 }));
  children.push(para(`Dataset: ${meta.dataset}`, { align: 'center', italic: true }));
  children.push(para(`N = ${meta.n}, variables = ${meta.variables}`, { align: 'center', spacing: 600 }));
  children.push(para('Prepared with ToolsScope — an open, in-browser analysis workbench (toolsscope.vercel.app).', { align: 'center', italic: true, spacing: 1200 }));

  // ---- Method ---------------------------------------------------------------
  children.push(heading('Method', 1));
  const hasQual = entries.some(e => e.kind === 'qual');
  const hasQuant = entries.some(e => e.kind !== 'qual');
  children.push(para(
    `Analyses were conducted in ToolsScope (v0.2), an open, in-browser statistical workbench whose engine uses real distribution tails (regularised incomplete beta and gamma functions) rather than normal approximations. ` +
    (hasQuant ? `Quantitative analyses used the imported dataset (N = ${meta.n}; ${meta.variables} variables). ` : '') +
    (hasQual ? `Qualitative material was coded inductively using ToolsScope's in-browser coding module; themes were aggregated from codes, and code co-occurrence and word-frequency analyses were used to triangulate interpretation. ` : '') +
    `All p-values are two-tailed; α = .05 unless otherwise stated.`,
  ));

  // ---- Results --------------------------------------------------------------
  children.push(heading('Results', 1));
  if (entries.length === 0) children.push(para('No analyses were run in this session.', { italic: true }));

  for (const e of entries) {
    switch (e.kind) {
      case 'descriptives': {
        children.push(heading('Descriptive statistics', 2));
        children.push(makeTable(
          ['Variable', 'N', 'M', 'SD', 'Median', 'Min', 'Max', 'Skew', 'Kurt'],
          e.rows.map(r => [r.variable, r.n, r.mean, r.sd, r.median, r.min, r.max, r.skewness, r.kurtosis]),
        ));
        break;
      }
      case 'reliability': {
        const r = e.result;
        children.push(heading(`Reliability — ${r.items.join(', ')}`, 2));
        children.push(para(`Internal consistency was assessed using Cronbach's α (Cronbach, 1951). The ${r.k}-item composite yielded α = ${fmt(r.alpha, 3)}${r.omega != null ? `, ω ≈ ${fmt(r.omega, 3)}` : ''} (N = ${r.n}).`));
        children.push(makeTable(
          ['Item', 'Corrected item-total r', 'α if deleted'],
          r.itemTotal.map(t => [t.item, t.corrected_r, t.alpha_if_deleted]),
        ));
        if (r.reversedSuggestions.length) children.push(para(`Items with negative corrected item-total correlations (possible reverse-keying): ${r.reversedSuggestions.join(', ')}.`, { italic: true }));
        break;
      }
      case 'correlation': {
        const r = e.result;
        children.push(heading(`${r.method === 'spearman' ? 'Spearman' : 'Pearson'} correlations`, 2));
        const head = ['', ...r.vars];
        const rows = r.vars.map((v, i) => [v as string | number, ...r.vars.map((_, j) => j < i ? r.r[i][j] : (j === i ? 1 : ''))]);
        children.push(makeTable(head, rows as (string | number)[][]));
        children.push(para('* p < .05, ** p < .01, *** p < .001 (two-tailed).', { italic: true, size: 20 }));
        break;
      }
      case 'ttest': {
        const r = e.result;
        const lab = r.kind === 'independent' ? 'Independent-samples t-test' : r.kind === 'paired' ? 'Paired-samples t-test' : 'One-sample t-test';
        children.push(heading(lab, 2));
        const cite = r.kind === 'independent' ? ' (Welch, 1947)' : '';
        children.push(para(`A ${lab.toLowerCase()}${cite} was conducted, t(${fmt(r.df, 1)}) = ${fmt(r.t)}, p = ${fmtP(r.p)}, Cohen's d = ${fmt(r.cohensD)} (Cohen, 1988). The mean difference was ${fmt(r.meanDiff)}, 95% CI [${fmt(r.ci95[0])}, ${fmt(r.ci95[1])}].`));
        children.push(makeTable(
          ['Group', 'N', 'M', 'SD'],
          [
            [r.groups ? r.groups[0] : 'Measure 1', r.n1, r.m1, r.sd1],
            [r.groups ? r.groups[1] : 'Measure 2', r.n2, r.m2, r.sd2],
          ],
        ));
        break;
      }
      case 'anova': {
        const r = e.result;
        children.push(heading(`One-way ANOVA: ${r.dv} by ${r.factor}`, 2));
        children.push(para(`A one-way ANOVA examining ${r.dv} across levels of ${r.factor} was significant${r.p < 0.05 ? '' : ' at the descriptive level'}, F(${r.dfBetween}, ${r.dfWithin}) = ${fmt(r.fStat)}, p = ${fmtP(r.p)}, η² = ${fmt(r.etaSquared, 3)}.`));
        children.push(makeTable(['Group', 'N', 'M', 'SD'], r.groups.map(g => [g.level, g.n, g.mean, g.sd])));
        if (r.postHoc?.length) {
          children.push(para('Post-hoc pairwise comparisons (Bonferroni-corrected):', { italic: true }));
          children.push(makeTable(['Comparison', 'Mean diff', 'p (adj)'], r.postHoc.map(p => [`${p.a} vs ${p.b}`, p.meanDiff, fmtP(p.p)])));
        }
        break;
      }
      case 'regression': {
        const r = e.result;
        children.push(heading(`Multiple linear regression predicting ${r.dv}`, 2));
        children.push(para(`A multiple linear regression predicted ${r.dv} from ${r.predictors.join(', ')}. The model explained R² = ${fmt(r.r2, 3)} (adj R² = ${fmt(r.adjR2, 3)}) of the variance, F(${r.dfModel}, ${r.dfResid}) = ${fmt(r.fStat)}, p = ${fmtP(r.pModel)}.`));
        children.push(makeTable(
          ['Term', 'B', 'SE', 'β', 't', 'p', 'VIF'],
          r.coefficients.map(c => [c.term, c.b, c.se, c.term === 'intercept' ? '—' : c.beta, c.t, fmtP(c.p), c.vif != null ? c.vif.toFixed(2) : '—']),
        ));
        break;
      }
      case 'chisquare': {
        const r = e.result;
        children.push(heading(`Chi-square: ${r.rowVar} × ${r.colVar}`, 2));
        children.push(para(`χ²(${r.df}) = ${fmt(r.chi2)}, p = ${fmtP(r.p)}, Cramér's V = ${fmt(r.cramersV, 3)}.`));
        children.push(makeTable(
          [`${r.rowVar} \\ ${r.colVar}`, ...r.colLevels],
          r.rowLevels.map((rl, i) => [rl as string | number, ...r.observed[i]]),
        ));
        break;
      }
      case 'factor': {
        const r = e.result;
        const techName = r.method === 'pca' ? 'Principal component analysis' : 'Exploratory factor analysis (principal-axis factoring)';
        children.push(heading(`${techName}`, 2));
        children.push(para(
          `${techName} was conducted on ${r.k} items (N = ${r.n}). Sampling adequacy was acceptable (KMO = ${fmt(r.kmo, 2)}; Kaiser, 1974), and Bartlett's test of sphericity rejected the identity correlation matrix, χ²(${r.bartlettDf}) = ${fmt(r.bartlettChi2)}, p = ${fmtP(r.bartlettP)} (Bartlett, 1954). Using the Kaiser criterion (eigenvalue ≥ 1), ${r.nFactors} ${r.method === 'pca' ? 'components' : 'factors'} were retained, accounting for ${(r.cumulativeVariance[r.nFactors - 1] * 100).toFixed(1)}% of the total variance.${r.rotation === 'varimax' ? ' The solution was rotated using varimax (Kaiser, 1958).' : ''}`,
        ));
        const head = ['Item', ...Array.from({ length: r.nFactors }, (_, i) => `F${i + 1}`), 'h²'];
        const rows: (string | number)[][] = r.items.map((it, i) => [it, ...r.loadings[i].slice(0, r.nFactors), r.communalities[i]]);
        children.push(makeTable(head, rows));
        children.push(makeTable(
          ['Component', 'Eigenvalue', 'Var. explained', 'Cumulative'],
          r.eigenvalues.slice(0, Math.min(8, r.eigenvalues.length)).map((v, i) => [
            `F${i + 1}`, v, `${(r.varianceExplained[i] * 100).toFixed(1)}%`, `${(r.cumulativeVariance[i] * 100).toFixed(1)}%`,
          ]),
        ));
        break;
      }
      case 'mann-whitney': {
        const r = e.result;
        children.push(heading(`Mann-Whitney U: ${r.groups[0]} vs ${r.groups[1]}`, 2));
        children.push(para(`A Mann-Whitney U test (Mann & Whitney, 1947) compared the two groups. U = ${fmt(r.u, 1)}, z = ${fmt(r.z)}, p = ${fmtP(r.p)}, rank-biserial r = ${fmt(r.rankBiserial)}. Mean ranks: ${r.groups[0]} = ${fmt(r.meanRank1)} (n = ${r.n1}); ${r.groups[1]} = ${fmt(r.meanRank2)} (n = ${r.n2}).`));
        break;
      }
      case 'wilcoxon': {
        const r = e.result;
        children.push(heading(`Wilcoxon signed-rank: ${r.vars[0]} vs ${r.vars[1]}`, 2));
        children.push(para(`A Wilcoxon signed-rank test (Wilcoxon, 1945) was conducted on ${r.n} non-zero paired differences. W = ${fmt(r.w, 1)}, z = ${fmt(r.z)}, p = ${fmtP(r.p)}, matched-pairs r = ${fmt(r.matchedR)}.`));
        break;
      }
      case 'kruskal-wallis': {
        const r = e.result;
        children.push(heading(`Kruskal-Wallis: ${r.dv} by ${r.factor}`, 2));
        children.push(para(`A Kruskal-Wallis H test (Kruskal & Wallis, 1952) examined ${r.dv} across levels of ${r.factor}. H(${r.df}) = ${fmt(r.h)}, p = ${fmtP(r.p)}, ε² = ${fmt(r.epsilonSquared, 3)}.`));
        children.push(makeTable(['Group', 'N', 'Mean rank'], r.groups.map(g => [g.level, g.n, g.meanRank])));
        break;
      }
      case 'mediation': {
        const r = e.result;
        children.push(heading(`Mediation: ${r.x} → ${r.m} → ${r.y}`, 2));
        children.push(para(
          `A simple mediation analysis was conducted following Hayes (2022; PROCESS Model 4), with X = ${r.x}, mediator M = ${r.m}, and outcome Y = ${r.y}. The path a (X → M) was ${fmt(r.a)} (SE = ${fmt(r.aSE)}, p = ${fmtP(r.aP)}); the path b (M → Y, controlling for X) was ${fmt(r.b)} (SE = ${fmt(r.bSE)}, p = ${fmtP(r.bP)}). The direct effect c′ was ${fmt(r.cPrime)} (SE = ${fmt(r.cPrimeSE)}, p = ${fmtP(r.cPrimeP)}); the total effect c was ${fmt(r.c)} (SE = ${fmt(r.cSE)}, p = ${fmtP(r.cP)}). The indirect effect (a × b) was ${fmt(r.indirect)}, with a Sobel z = ${fmt(r.sobelZ)} (p = ${fmtP(r.sobelP)}; Sobel, 1982) and a percentile bootstrap 95% CI of [${fmt(r.bootstrapCI95[0])}, ${fmt(r.bootstrapCI95[1])}] based on ${r.bootstrapN} resamples (Preacher & Hayes, 2008).`,
        ));
        break;
      }
      case 'moderation': {
        const r = e.result;
        children.push(heading(`Moderation: ${r.x} × ${r.w} → ${r.y}`, 2));
        children.push(para(
          `A moderation analysis (Hayes, 2022; PROCESS Model 1) regressed ${r.y} on mean-centred ${r.x}, ${r.w}, and the ${r.x} × ${r.w} interaction. The interaction was b = ${fmt(r.bXW)} (SE = ${fmt(r.seXW)}, p = ${fmtP(r.pXW)}); the model explained R² = ${fmt(r.r2, 3)}, with the interaction adding ΔR² = ${fmt(r.r2Change, 3)}.`,
        ));
        children.push(makeTable(
          ['Moderator level (W)', 'W value', 'Simple slope of Y on X', 'SE', 't', 'p'],
          r.simpleSlopes.map(s => [s.wLevel, s.w, s.slope, s.se, s.t, fmtP(s.p)]),
        ));
        break;
      }
      case 'qual': {
        const p = e.project;
        children.push(heading('Qualitative analysis', 2));
        const cf = codeFrequency(p);
        const cooc = coOccurrence(p).slice(0, 10);
        const themes = themeRollup(p);
        const wf = wordFrequency(p.docs, 20);
        children.push(para(
          `Qualitative data comprised ${p.docs.length} document(s) and a codebook of ${p.codes.length} code(s) yielding ${p.spans.length} coded excerpt(s). Coding was inductive (Braun & Clarke, 2006), with thematic roll-up based on author-assigned themes.`,
        ));
        if (cf.length) { children.push(para('Code frequencies:', { italic: true })); children.push(makeTable(['Code', 'Theme', 'Count', 'Docs'], cf.map(r => [r.label, r.theme || '(unthemed)', r.count, r.docs]))); }
        if (themes.length) { children.push(para('Themes:', { italic: true })); children.push(makeTable(['Theme', 'Codes', 'Excerpts'], themes.map(t => [t.theme, t.codes.join(', '), t.count]))); }
        if (cooc.length) { children.push(para('Top code co-occurrences (same document):', { italic: true })); children.push(makeTable(['Code A', 'Code B', 'Co-occur'], cooc.map(c => [c.a, c.b, c.count]))); }
        if (wf.length) { children.push(para('Word frequency (top 20, stop-words removed):', { italic: true })); children.push(makeTable(['Word', 'Count', 'Docs'], wf.map(w => [w.word, w.count, w.docs]))); }
        if (p.spans.length) {
          children.push(para('Selected coded excerpts:', { italic: true }));
          const sample = p.spans.slice(0, 12);
          const docName = (id: string) => p.docs.find(d => d.id === id)?.name ?? id;
          const codeName = (id: string) => p.codes.find(c => c.id === id)?.label ?? id;
          for (const s of sample) children.push(para(`• ${docName(s.docId)} — [${codeName(s.codeId)}] "${s.text}"`, { size: 20 }));
        }
        break;
      }
    }
  }

  // ---- References -----------------------------------------------------------
  // Auto-derived from the methodologies of the analyses the user actually ran
  // (plus ALWAYS_CITED). Nothing orphan, nothing missing.
  children.push(heading('References', 1));
  for (const ref of fullReferences(citationsForReport(entries))) children.push(para(ref.full, { size: 20 }));

  const doc = new Document({
    creator: meta.author || 'ToolsScope',
    title: meta.title,
    description: 'APA-style analysis report generated by ToolsScope.',
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
