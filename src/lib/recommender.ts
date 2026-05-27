// ToolsScope test recommender.
//
// On dataset load we profile every variable (skew, kurt, missingness, levels,
// likely composites, etc.) and surface ranked analysis suggestions with a
// *reason* the user can review — so the recommender is honest, not a black
// box, and so no test is run "for the sake of the test".
//
// Recommendations carry a `methodId` (matches `methodology.ts`) and a target
// shape for each Analyze section so the user can click once and have the
// variables already filled in.

import type { Dataset, Variable } from './types';
import { column } from './parse';
import { describe } from './stats';
import { METHODS, CITATIONS } from './methodology';

export interface VarProfile {
  name: string;
  type: Variable['type'];
  n: number;
  missing: number;
  missingPct: number;
  mean?: number;
  sd?: number;
  skew?: number;
  kurt?: number;
  levels?: number;
  uniqueRatio?: number;
  nonNormal?: boolean;          // |skew|>1 OR |excess kurt|>3
  smallN?: boolean;             // n < 30
  ceilingEffect?: boolean;
  floorEffect?: boolean;
  likertMin?: number;
  likertMax?: number;
  cadenceScaleAbbr?: string;
  cadenceDim?: string;
  cadenceReversed?: boolean;
  cadenceComposite?: boolean;
  cadenceCompositeItems?: string[];
}

export function profileVariable(ds: Dataset, v: Variable): VarProfile {
  const col = column(ds, v.name);
  const d = describe(v.name, col);
  const profile: VarProfile = {
    name: v.name,
    type: v.type,
    n: d.n,
    missing: d.missing,
    missingPct: ds.rows.length ? d.missing / ds.rows.length : 0,
    levels: v.levels?.length,
    likertMin: v.likertMin,
    likertMax: v.likertMax,
    cadenceScaleAbbr: v.cadenceScaleAbbr,
    cadenceDim: v.cadenceDim,
    cadenceReversed: v.cadenceReversed,
    cadenceComposite: v.cadenceComposite,
    cadenceCompositeItems: v.cadenceCompositeItems,
  };
  if (v.type === 'numeric' || v.type === 'likert') {
    profile.mean = d.mean; profile.sd = d.sd;
    profile.skew = d.skewness; profile.kurt = d.kurtosis;
    profile.nonNormal = Math.abs(d.skewness) > 1 || Math.abs(d.kurtosis) > 3;
    profile.smallN = d.n < 30;
    if (v.likertMax != null && Number.isFinite(d.mean)) {
      profile.ceilingEffect = d.mean >= v.likertMax - 0.5;
      profile.floorEffect = d.mean <= (v.likertMin ?? 1) + 0.5;
    }
  }
  if (v.type === 'categorical' || v.type === 'text' || v.type === 'id') {
    const unique = new Set(col.filter(c => c !== null && c !== '').map(String)).size;
    profile.uniqueRatio = ds.rows.length ? unique / ds.rows.length : 0;
  }
  return profile;
}

export interface Recommendation {
  id: string;                  // stable key per recommendation
  methodId: keyof typeof METHODS;
  title: string;               // e.g. "Mann-Whitney U: engagement by condition"
  reason: string;              // why this beat the parametric/alternative
  citationKeys: string[];      // pulled from the methodology + reason
  priority: number;            // higher = more central, shown first
  preset: AnalyzePreset;       // tells Analyze how to pre-fill controls
}

// Preset that the Analyze tab consumes to jump to the right section + select vars.
export type AnalyzePreset =
  | { kind: 'descriptives'; vars: string[] }
  | { kind: 'reliability'; items: string[] }
  | { kind: 'correlation'; method: 'pearson' | 'spearman'; vars: string[] }
  | { kind: 'ttest'; mode: 'independent' | 'paired'; dv?: string; grp?: string; x?: string; y?: string }
  | { kind: 'anova'; dv: string; factor: string }
  | { kind: 'regression'; dv: string; preds: string[] }
  | { kind: 'chisquare'; rowV: string; colV: string }
  | { kind: 'factor'; method: 'pca' | 'efa'; items: string[] }
  | { kind: 'nonparam'; test: 'mann' | 'wilcoxon' | 'kw'; dv?: string; grp?: string; x?: string; y?: string }
  | { kind: 'mediation'; x: string; m: string; y: string }
  | { kind: 'moderation'; x: string; w: string; y: string };

// Map a Recommendation.preset to the Kind string used by Analyze.tsx's segmented control.
export function presetTab(preset: AnalyzePreset): string {
  switch (preset.kind) {
    case 'descriptives': return 'descriptives';
    case 'reliability': return 'reliability';
    case 'correlation': return 'correlation';
    case 'ttest': return 'ttest';
    case 'anova': return 'anova';
    case 'regression': return 'regression';
    case 'chisquare': return 'chisquare';
    case 'factor': return 'factor';
    case 'nonparam': return 'nonparam';
    case 'mediation': return 'mediation';
    case 'moderation': return 'moderation';
  }
}

export interface ProfileReport {
  profiles: VarProfile[];
  recommendations: Recommendation[];
  warnings: string[];
}

const f = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';

export function profileDataset(ds: Dataset): ProfileReport {
  const profiles = ds.variables.map(v => profileVariable(ds, v));
  const byName = new Map(profiles.map(p => [p.name, p]));
  const recs: Recommendation[] = [];
  const warnings: string[] = [];

  const allNumerics = profiles.filter(p => p.type === 'numeric' || p.type === 'likert');
  // Cadence ingest auto-computes scale composites (UWES_vigor, UWES_dedication, …).
  // When composites are present they are the right unit of analysis for
  // inferential tests — raw items are for reliability only. So we hide raw
  // scale items from t-tests, ANOVA, regression, and correlation when at
  // least one composite exists; otherwise (CSV uploads, non-Cadence data) we
  // fall back to the full numeric set.
  const composites = allNumerics.filter(p => p.cadenceComposite);
  const rawScaleItems = new Set(allNumerics.filter(p => p.cadenceScaleAbbr && !p.cadenceComposite).map(p => p.name));
  const numerics = composites.length > 0
    ? allNumerics.filter(p => p.cadenceComposite || !rawScaleItems.has(p.name))
    : allNumerics;
  const cats = profiles.filter(p => p.type === 'categorical');
  const cats2 = cats.filter(p => (p.levels ?? 0) === 2);
  const catsMulti = cats.filter(p => (p.levels ?? 0) >= 3);
  const N = ds.rows.length;

  // ------- (1) Descriptives — always recommended first -------
  if (numerics.length > 0) {
    const vars = numerics.slice(0, 8).map(p => p.name);
    recs.push({
      id: 'desc-all',
      methodId: 'descriptives',
      title: `Descriptives for ${vars.length} variable${vars.length === 1 ? '' : 's'}`,
      reason: 'Always report before inferential tests (APA, 2020). Provides the M/SD/skew/kurt you need to vet other assumptions.',
      citationKeys: ['apa2020', 'field2018'],
      priority: 100,
      preset: { kind: 'descriptives', vars },
    });
  }

  // ------- (2) Reliability — group items by Cadence scale or by name prefix -------
  const scaleGroups = groupScaleCandidates(profiles);
  for (const g of scaleGroups) {
    if (g.items.length < 3) continue;
    recs.push({
      id: `rel-${g.label}`,
      methodId: 'reliability',
      title: `Reliability on ${g.label} (${g.items.length} items)`,
      reason: g.source === 'cadence'
        ? `Items share Cadence scale "${g.label}". Cronbach's α is the standard internal-consistency index ${CITATIONS.cronbach1951.parenthetical} for tau-equivalent items; ω is reported as a congeneric complement ${CITATIONS.mcdonald1999.parenthetical}.`
        : `Items share the name prefix "${g.label}" — they look like a multi-item composite. Cronbach's α evaluates whether they cohere as a scale ${CITATIONS.cronbach1951.parenthetical}.`,
      citationKeys: ['cronbach1951', 'mcdonald1999'],
      priority: 92,
      preset: { kind: 'reliability', items: g.items },
    });
  }

  // ------- (3) Correlations — when 3+ numerics, suggest Pearson or Spearman -------
  if (numerics.length >= 3) {
    const anyNonNormal = numerics.some(p => p.nonNormal);
    const method: 'pearson' | 'spearman' = anyNonNormal ? 'spearman' : 'pearson';
    const sample = numerics.slice(0, 8).map(p => p.name);
    recs.push({
      id: `corr-${method}`,
      methodId: method === 'spearman' ? 'correlation_spearman' : 'correlation_pearson',
      title: `${method === 'spearman' ? 'Spearman' : 'Pearson'} correlation matrix (${sample.length} vars)`,
      reason: anyNonNormal
        ? `One or more variables look non-normal (e.g. ${numerics.find(p => p.nonNormal)?.name} has |skew| = ${f(Math.abs(numerics.find(p => p.nonNormal)?.skew ?? 0))}). Spearman is robust to non-normality and outliers ${CITATIONS.spearman1904.parenthetical}.`
        : `All selected variables are continuous and approximately normal. Pearson r is the standard parametric choice ${CITATIONS.pearson1904.parenthetical}.`,
      citationKeys: method === 'spearman' ? ['spearman1904', 'field2018'] : ['pearson1904', 'cohen1988'],
      priority: 80,
      preset: { kind: 'correlation', method, vars: sample },
    });
  }

  // ------- (4) Two-group comparisons — t-test or Mann-Whitney -------
  for (const dv of numerics) {
    for (const grp of cats2) {
      const groupSizes = groupSizes2(ds, dv.name, grp.name);
      if (!groupSizes) continue;
      const minN = Math.min(groupSizes.a, groupSizes.b);
      if (minN < 5) continue;
      const useNP = dv.nonNormal || minN < 20;
      const id = `cmp-${dv.name}-${grp.name}`;
      if (useNP) {
        recs.push({
          id,
          methodId: 'mann_whitney',
          title: `Mann-Whitney U: ${dv.name} by ${grp.name}`,
          reason: `${grp.name} has 2 levels; ${dv.name} is ${dv.nonNormal ? `non-normal (|skew| = ${f(Math.abs(dv.skew!))}, excess kurt = ${f(dv.kurt!)})` : `small-sample (n_min = ${minN})`}. Mann-Whitney U is the rank-based non-parametric counterpart of the t-test ${CITATIONS.mannwhitney1947.parenthetical}.`,
          citationKeys: ['mannwhitney1947', 'field2018'],
          priority: 70,
          preset: { kind: 'nonparam', test: 'mann', dv: dv.name, grp: grp.name },
        });
      } else {
        recs.push({
          id,
          methodId: 'ttest_independent',
          title: `Independent-samples t-test: ${dv.name} by ${grp.name}`,
          reason: `${grp.name} has 2 levels (n = ${groupSizes.a}, ${groupSizes.b}); ${dv.name} looks approximately normal (|skew| = ${f(Math.abs(dv.skew ?? 0))}). Welch's t handles unequal variances by default ${CITATIONS.welch1947.parenthetical}.`,
          citationKeys: ['welch1947', 'cohen1988'],
          priority: 72,
          preset: { kind: 'ttest', mode: 'independent', dv: dv.name, grp: grp.name },
        });
      }
    }
  }

  // ------- (5) 3+ group comparisons — ANOVA or Kruskal-Wallis -------
  for (const dv of numerics) {
    for (const grp of catsMulti) {
      const useNP = dv.nonNormal;
      const id = `cmpk-${dv.name}-${grp.name}`;
      if (useNP) {
        recs.push({
          id,
          methodId: 'kruskal_wallis',
          title: `Kruskal-Wallis: ${dv.name} by ${grp.name}`,
          reason: `${grp.name} has ${grp.levels} levels; ${dv.name} is non-normal (|skew| = ${f(Math.abs(dv.skew!))}). H test is the non-parametric ANOVA counterpart ${CITATIONS.kruskalwallis1952.parenthetical}.`,
          citationKeys: ['kruskalwallis1952', 'field2018'],
          priority: 65,
          preset: { kind: 'nonparam', test: 'kw', dv: dv.name, grp: grp.name },
        });
      } else {
        recs.push({
          id,
          methodId: 'anova',
          title: `One-way ANOVA: ${dv.name} by ${grp.name}`,
          reason: `${grp.name} has ${grp.levels} levels; ${dv.name} is approximately normal. ANOVA partitions variance and gives an effect size (η²) ${CITATIONS.fisher1925.parenthetical}.`,
          citationKeys: ['fisher1925', 'cohen1988'],
          priority: 67,
          preset: { kind: 'anova', dv: dv.name, factor: grp.name },
        });
      }
    }
  }

  // ------- (6) Chi-square — two categoricals -------
  if (cats.length >= 2) {
    for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i], b = cats[j];
      // Skip id-like high-cardinality cats
      if ((a.uniqueRatio ?? 0) > 0.6 || (b.uniqueRatio ?? 0) > 0.6) continue;
      if (N < 20) continue;
      recs.push({
        id: `chi-${a.name}-${b.name}`,
        methodId: 'chisquare',
        title: `Chi-square: ${a.name} × ${b.name}`,
        reason: `Both ${a.name} (${a.levels} levels) and ${b.name} (${b.levels} levels) are categorical. χ² tests the null of independence between them ${CITATIONS.pearson1900.parenthetical}.`,
        citationKeys: ['pearson1900', 'cohen1988'],
        priority: 55,
        preset: { kind: 'chisquare', rowV: a.name, colV: b.name },
      });
    }
  }

  // ------- (7) Regression — when there's a continuous DV + multiple numeric IVs -------
  if (numerics.length >= 3 && N >= 30) {
    // Heuristic: choose the variable with the most variance as the DV.
    const sorted = [...numerics].sort((p, q) => (q.sd ?? 0) - (p.sd ?? 0));
    const dv = sorted[0];
    const preds = sorted.slice(1, Math.min(5, sorted.length)).map(p => p.name);
    if (preds.length >= 2) {
      recs.push({
        id: `reg-${dv.name}`,
        methodId: 'regression',
        title: `Multiple regression: predict ${dv.name}`,
        reason: `With ${numerics.length} continuous variables and N = ${N} (above the 10-per-predictor heuristic ${CITATIONS.tabachnick2019.parenthetical}), an OLS regression of ${dv.name} on ${preds.join(', ')} is feasible. Inspect VIF for multicollinearity.`,
        citationKeys: ['cohen1988', 'tabachnick2019', 'field2018'],
        priority: 60,
        preset: { kind: 'regression', dv: dv.name, preds },
      });
    }
  }

  // ------- (8) Factor analysis — operates on raw Likert ITEMS, never composites -------
  const allLikertish = allNumerics.filter(p => (p.type === 'likert' || p.likertMin != null) && !p.cadenceComposite);
  // Prefer Cadence scale composites; otherwise any large set of likert-like items.
  if (allLikertish.length >= 6 && N >= Math.max(5 * allLikertish.length, 100)) {
    recs.push({
      id: `efa-likert`,
      methodId: 'factor_efa',
      title: `EFA (PAF + varimax) on ${allLikertish.length} Likert items`,
      reason: `You have ${allLikertish.length} Likert-type items and N = ${N} — adequate by the 5–10 cases per item heuristic ${CITATIONS.tabachnick2019.parenthetical}. Principal-axis factoring with varimax rotation is the standard for inducing a common-factor structure ${CITATIONS.fabrigar1999.parenthetical}.`,
      citationKeys: ['fabrigar1999', 'costello2005', 'kaiser1958', 'kaiser1974'],
      priority: 50,
      preset: { kind: 'factor', method: 'efa', items: allLikertish.slice(0, 20).map(p => p.name) },
    });
  }

  // ------- (9) Wave-aware: composites + multiple waves -------
  if (ds.source === 'cadence' && ds.variables.some(v => v.cadenceWaveCol)) {
    const nWaves = new Set(ds.rows.map(r => r.waveNum).filter(v => typeof v === 'number')).size;
    if (composites.length > 0 && nWaves >= 2) {
      warnings.push(`Cadence multi-wave study with ${composites.length} auto-computed composite${composites.length === 1 ? '' : 's'} (${composites.slice(0, 4).map(c => c.name).join(', ')}${composites.length > 4 ? '…' : ''}). For paired-wave comparison, filter to two waves and use Wilcoxon signed-rank on the composite column.`);
    } else if (composites.length > 0) {
      warnings.push(`${composites.length} scale composite${composites.length === 1 ? '' : 's'} auto-computed from raw items (${composites.slice(0, 4).map(c => c.name).join(', ')}${composites.length > 4 ? '…' : ''}). Use these as your DV — raw items are for reliability only.`);
    } else {
      warnings.push('Cadence study with multiple waves detected — once you compute scale composites per wave, the Wilcoxon signed-rank test compares paired waves directly.');
    }
  }
  void byName;

  // ------- (10) High missingness -------
  const heavyMiss = profiles.filter(p => p.missingPct > 0.2);
  if (heavyMiss.length) {
    warnings.push(`High missingness (>20%) in: ${heavyMiss.map(p => `${p.name} (${(p.missingPct * 100).toFixed(0)}%)`).join(', ')}. Consider documenting why before running inferential tests (Tabachnick & Fidell, 2019).`);
  }

  // ------- (11) Small N -------
  if (N < 30) warnings.push(`N = ${N} is small. Effect-size estimates are unstable and parametric assumptions are harder to verify; lean on nonparametric counterparts (Mann-Whitney, Wilcoxon, Kruskal-Wallis) when in doubt.`);

  recs.sort((a, b) => b.priority - a.priority);
  return { profiles, recommendations: recs, warnings };
}

// ---- helpers ---------------------------------------------------------------

interface ScaleGroup { label: string; items: string[]; source: 'cadence' | 'prefix' }
function groupScaleCandidates(profiles: VarProfile[]): ScaleGroup[] {
  // Two-tier Cadence grouping: by (scale, dim) when the scale carries
  // subdimensions, otherwise by scale alone. Each subscale gets its own
  // reliability suggestion since UWES-Vigor, UWES-Dedication etc. are
  // separate constructs and should be reported separately.
  const byScale = new Map<string, string[]>();
  const byScaleDim = new Map<string, { abbr: string; dim: string; items: string[] }>();
  for (const p of profiles) {
    if (!p.cadenceScaleAbbr) continue;
    const k = p.cadenceScaleAbbr;
    if (!byScale.has(k)) byScale.set(k, []);
    byScale.get(k)!.push(p.name);
    if (p.cadenceDim) {
      const dk = `${k}::${p.cadenceDim}`;
      if (!byScaleDim.has(dk)) byScaleDim.set(dk, { abbr: k, dim: p.cadenceDim, items: [] });
      byScaleDim.get(dk)!.items.push(p.name);
    }
  }
  const out: ScaleGroup[] = [];
  // Prefer subscale-level groupings; only emit the umbrella scale if no
  // subdim version was emitted (otherwise the user gets duplicate suggestions).
  const dimmed = new Set<string>();
  for (const { abbr, dim, items } of byScaleDim.values()) {
    if (items.length >= 3) { out.push({ label: `${abbr} · ${dim}`, items, source: 'cadence' }); dimmed.add(abbr); }
  }
  for (const [label, items] of byScale) {
    if (dimmed.has(label)) continue;
    if (items.length >= 3) out.push({ label, items, source: 'cadence' });
  }

  // Fall back to name-prefix grouping for non-Cadence imports.
  if (out.length === 0) {
    const buckets = new Map<string, string[]>();
    for (const p of profiles) {
      if (p.type !== 'numeric' && p.type !== 'likert') continue;
      const m = p.name.match(/^([A-Za-z]+?)[_\-]?\d+$/);
      if (!m) continue;
      const k = m[1];
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(p.name);
    }
    for (const [label, items] of buckets) if (items.length >= 3) out.push({ label, items, source: 'prefix' });
  }
  return out;
}

function groupSizes2(ds: Dataset, dv: string, grp: string): { a: number; b: number } | null {
  const gCol = column(ds, grp), dCol = column(ds, dv);
  const counts: Record<string, number> = {};
  for (let i = 0; i < gCol.length; i++) {
    const g = gCol[i], v = dCol[i];
    if (g === null || g === '' || v === null || v === '' || !Number.isFinite(Number(v))) continue;
    counts[String(g)] = (counts[String(g)] ?? 0) + 1;
  }
  const keys = Object.keys(counts);
  if (keys.length !== 2) return null;
  return { a: counts[keys[0]], b: counts[keys[1]] };
}

