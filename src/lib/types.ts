// ToolsScope core types.
// ToolsScope is an in-browser analysis & visualization workbench: cleaned data
// (from Cadence, or any CSV/XLSX upload) flows in, and ToolsScope replicates the
// core analytical features researchers report in papers — the things you'd
// otherwise run in SPSS/R/jamovi — plus the figures that accompany them.
// Sibling of ScaleScope/TheoryScope; fills the *analyze* step of the Research
// Suite (Cadence collect → ToolsScope analyze → JournalTime write).

// How a column is treated in analyses. Auto-detected on import, user-overridable.
export type VarType =
  | 'numeric'       // continuous / interval
  | 'likert'        // ordered numeric responses on a small fixed scale (1–5, 1–7)
  | 'categorical'   // nominal groups (gender, condition)
  | 'text'          // free text (qualitative; not analysed quantitatively in v1)
  | 'id';           // identifier / not for analysis

export type Cell = number | string | null;

export interface Variable {
  name: string;
  type: VarType;
  levels?: (string | number)[]; // distinct observed values (categorical/likert)
  missing: number;              // count of missing/blank cells
  // likert metadata when detected
  likertMin?: number;
  likertMax?: number;
}

export interface Dataset {
  name: string;
  source: 'upload' | 'paste' | 'cadence' | 'demo';
  variables: Variable[];
  rows: Record<string, Cell>[];
}

// ---- Analysis result shapes (rendered by the Analyze view, narrated by AI) ----

export interface DescriptiveRow {
  variable: string;
  n: number;
  missing: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  median: number;
  skewness: number;
  kurtosis: number;
}

export interface ReliabilityResult {
  items: string[];
  n: number;            // complete cases used
  k: number;            // number of items
  alpha: number;        // Cronbach's α
  omega?: number;       // McDonald's ω (approx, from a single-factor loading est.)
  itemTotal: { item: string; corrected_r: number; alpha_if_deleted: number }[];
  reversedSuggestions: string[]; // items whose corrected item-total r is negative
}

export interface CorrelationResult {
  vars: string[];
  r: number[][];        // Pearson (or Spearman) matrix
  p: number[][];        // two-tailed p-values
  n: number[][];        // pairwise N
  method: 'pearson' | 'spearman';
}

export interface TTestResult {
  kind: 'independent' | 'paired' | 'one-sample';
  groups?: [string, string];
  m1: number; m2: number;
  sd1: number; sd2: number;
  n1: number; n2: number;
  t: number; df: number; p: number;
  meanDiff: number;
  cohensD: number;      // effect size
  ci95: [number, number]; // CI of the mean difference
}

export interface AnovaResult {
  factor: string;
  dv: string;
  groups: { level: string; n: number; mean: number; sd: number }[];
  fStat: number; dfBetween: number; dfWithin: number; p: number;
  etaSquared: number;   // effect size
  postHoc?: { a: string; b: string; meanDiff: number; p: number }[]; // Tukey-ish
}

export interface RegressionResult {
  dv: string;
  predictors: string[];
  n: number;
  r2: number; adjR2: number;
  fStat: number; dfModel: number; dfResid: number; pModel: number;
  coefficients: {
    term: string;       // 'intercept' or predictor name
    b: number;          // unstandardised
    se: number;
    beta: number;       // standardised (NaN for intercept)
    t: number;
    p: number;
    vif?: number;
  }[];
}

export interface ChiSquareResult {
  rowVar: string;
  colVar: string;
  observed: number[][];
  expected: number[][];
  rowLevels: string[];
  colLevels: string[];
  chi2: number; df: number; p: number;
  cramersV: number;     // effect size
}

// Visualization spec the Visualize view builds from.
export type ChartType =
  | 'histogram'
  | 'bar-means'         // group means with error bars
  | 'boxplot'
  | 'scatter'           // + fit line
  | 'heatmap'           // correlation matrix
  | 'likert-stacked';   // stacked distribution of Likert items

export interface ChartSpec {
  type: ChartType;
  title?: string;
  x?: string;
  y?: string;
  group?: string;
  items?: string[];     // for likert-stacked / heatmap
}
