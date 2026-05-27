// ResearchPack receiver for ToolsScope.
//
// ResearchFlow exports a versioned pack containing the planned study (theory,
// hypotheses, design, instruments, analysis tests). ToolsScope opens with
// `#pack=<b64>` and stores the pack in localStorage so it survives the
// data-upload step that comes next. The pack is read in three places:
//
//   1) App: pre-fill report title/author from `title` / keywords.
//   2) Suggestions: highlight recommendations matching `analysis.tests`.
//   3) Report: cite the framework + question + hypotheses in Methods.
//
// Source of truth for the schema is researchflow/src/lib/researchpack.ts. We
// declare a thin local copy because the three apps deploy independently — a
// shared NPM package would be cleaner but every shape change would then need
// a coordinated release. The pack is forward-compatible: unknown keys are
// preserved through JSON.parse and simply ignored.

export type AnalysisTest =
  | 'descriptives' | 'reliability'
  | 'correlation_pearson' | 'correlation_spearman'
  | 'ttest_independent' | 'ttest_paired'
  | 'anova' | 'regression' | 'chisquare'
  | 'factor_pca' | 'factor_efa'
  | 'mann_whitney' | 'wilcoxon' | 'kruskal_wallis'
  | 'mediation' | 'moderation' | 'qual_coding';

export interface ResearchPack {
  source: 'researchflow';
  v: 1;
  exportedAt: string;
  idea?: string;
  question?: string;
  field?: string;
  gap?: string;
  keywords?: string[];
  theory?: { name?: string; justification?: string; theoryscopeSlug?: string };
  hypotheses?: { id: string; statement: string; iv?: string; dv?: string; moderator?: string; direction?: string; rationale?: string }[];
  nullHypothesis?: string;
  design?: { paradigm?: string; approach?: string; design?: string; waves?: number; conditions?: string[] };
  sampling?: { targetPopulation?: string; samplingMethod?: string; targetN?: number; inclusionCriteria?: string[]; exclusionCriteria?: string[] };
  instruments?: { construct: string; scaleName: string; scaleAbbr?: string; scalebaseId?: string; itemCount?: number; responseFormat?: string; reliability?: string; citation?: string; dims?: string[] }[];
  analysis?: { plan?: string; mainTest?: string; software?: string[]; tests?: AnalysisTest[]; assumptionChecks?: string[] };
  title?: string;
  abstract?: string;
}

const STORAGE_KEY = 'ts_research_pack';

export function decodeResearchPack(b64: string): ResearchPack | null {
  try {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(norm);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as ResearchPack;
    if (parsed?.source !== 'researchflow' || parsed?.v !== 1) return null;
    return parsed;
  } catch { return null; }
}

export function saveResearchPack(pack: ResearchPack): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pack)); } catch { /* quota */ }
}

export function loadResearchPack(): ResearchPack | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResearchPack;
    if (parsed?.source !== 'researchflow' || parsed?.v !== 1) return null;
    return parsed;
  } catch { return null; }
}

export function clearResearchPack(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// Recommendations that map to a test the user has explicitly planned should
// be highlighted. We match on the recommender's `methodId` (which is itself
// keyed to METHODS in methodology.ts, the same vocabulary the pack uses).
export function isPlannedTest(pack: ResearchPack | null, methodId: string): boolean {
  if (!pack?.analysis?.tests) return false;
  return pack.analysis.tests.includes(methodId as AnalysisTest);
}
