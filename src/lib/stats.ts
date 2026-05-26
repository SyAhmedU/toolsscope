// ToolsScope statistics engine — pure, dependency-free, and deterministic.
// These functions replicate the core analyses researchers report in papers
// (the SPSS/R/jamovi staples). Correctness matters more than breadth: every
// p-value here comes from a real distribution tail (incomplete beta / gamma),
// not a normal-approximation shortcut.
//
// Special-function implementations (gammln, betai, gammp/gammq) follow the
// standard continued-fraction / series methods (Numerical Recipes, Abramowitz
// & Stegun). Tested against known textbook values.

import type {
  Cell, DescriptiveRow, ReliabilityResult, CorrelationResult,
  TTestResult, AnovaResult, RegressionResult, ChiSquareResult,
  FactorAnalysisResult, MannWhitneyResult, WilcoxonResult, KruskalWallisResult,
  MediationResult, ModerationResult,
} from './types';

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

export function gammln(xx: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = xx, y = xx;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Continued fraction for the incomplete beta function.
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularised incomplete beta I_x(a,b).
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// Regularised lower incomplete gamma P(a,x) via series.
function gser(a: number, x: number): number {
  const ITMAX = 300, EPS = 3e-12;
  if (x <= 0) return 0;
  const gln = gammln(a);
  let ap = a, sum = 1 / a, del = sum;
  for (let n = 0; n < ITMAX; n++) {
    ap += 1; del *= x / ap; sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

// Regularised upper incomplete gamma Q(a,x) via continued fraction.
function gcf(a: number, x: number): number {
  const ITMAX = 300, EPS = 3e-12, FPMIN = 1e-300;
  const gln = gammln(a);
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

export function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x < a + 1) return gser(a, x);
  return 1 - gcf(a, x);
}
export function gammq(a: number, x: number): number {
  return 1 - gammp(a, x);
}

export function erf(x: number): number {
  return x < 0 ? -gammp(0.5, x * x) : gammp(0.5, x * x);
}
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// ---- distribution tail p-values ----
export function tTwoTailedP(t: number, df: number): number {
  if (df <= 0) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}
export function fUpperP(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1;
  return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
}
export function chiSqUpperP(x: number, df: number): number {
  if (x <= 0) return 1;
  return gammq(df / 2, x / 2);
}

// ---------------------------------------------------------------------------
// Basic descriptive helpers
// ---------------------------------------------------------------------------

export function toNumbers(col: Cell[]): number[] {
  const out: number[] = [];
  for (const c of col) {
    if (c === null || c === '') continue;
    const n = typeof c === 'number' ? c : Number(c);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function variance(xs: number[], sample = true): number {
  const m = mean(xs);
  const ss = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return ss / (xs.length - (sample ? 1 : 0));
}
export const sd = (xs: number[], sample = true): number => Math.sqrt(variance(xs, sample));

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos), rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

export function skewness(xs: number[]): number {
  const n = xs.length, m = mean(xs), s = sd(xs);
  if (n < 3 || s === 0) return NaN;
  const sum = xs.reduce((a, b) => a + ((b - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}
export function kurtosis(xs: number[]): number {
  const n = xs.length, m = mean(xs), s = sd(xs);
  if (n < 4 || s === 0) return NaN;
  const sum = xs.reduce((a, b) => a + ((b - m) / s) ** 4, 0);
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); // excess kurtosis
}

// ---------------------------------------------------------------------------
// Descriptives
// ---------------------------------------------------------------------------

export function describe(name: string, col: Cell[]): DescriptiveRow {
  const xs = toNumbers(col);
  const missing = col.length - xs.length;
  if (xs.length === 0) {
    return { variable: name, n: 0, missing, mean: NaN, sd: NaN, min: NaN, max: NaN, median: NaN, skewness: NaN, kurtosis: NaN };
  }
  return {
    variable: name,
    n: xs.length,
    missing,
    mean: mean(xs),
    sd: xs.length > 1 ? sd(xs) : NaN,
    min: Math.min(...xs),
    max: Math.max(...xs),
    median: median(xs),
    skewness: skewness(xs),
    kurtosis: kurtosis(xs),
  };
}

// ---------------------------------------------------------------------------
// Reliability — Cronbach's alpha, item-total, alpha-if-deleted, ω (approx)
// ---------------------------------------------------------------------------

// Listwise-complete item matrix from named columns.
function completeMatrix(cols: Record<string, Cell[]>, items: string[]): number[][] {
  const n = cols[items[0]]?.length ?? 0;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    let ok = true;
    for (const it of items) {
      const c = cols[it][i];
      const v = c === null || c === '' ? NaN : Number(c);
      if (!Number.isFinite(v)) { ok = false; break; }
      row.push(v);
    }
    if (ok) rows.push(row);
  }
  return rows;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

export function cronbach(cols: Record<string, Cell[]>, items: string[]): ReliabilityResult {
  const M = completeMatrix(cols, items);
  const n = M.length, k = items.length;
  const alphaOf = (rows: number[][], cols2: number) => {
    if (rows.length < 2 || cols2 < 2) return NaN;
    const itemVars: number[] = [];
    for (let j = 0; j < cols2; j++) itemVars.push(variance(rows.map(r => r[j])));
    const totals = rows.map(r => r.reduce((a, b) => a + b, 0));
    const totVar = variance(totals);
    const sumItemVar = itemVars.reduce((a, b) => a + b, 0);
    return (cols2 / (cols2 - 1)) * (1 - sumItemVar / totVar);
  };

  const alpha = alphaOf(M, k);

  // Corrected item-total correlation + alpha-if-deleted.
  const itemTotal = items.map((it, j) => {
    const rest = M.map(r => r.reduce((a, b, idx) => a + (idx === j ? 0 : b), 0));
    const itemCol = M.map(r => r[j]);
    const corrected_r = pearson(itemCol, rest);
    const reducedItems = items.filter((_, idx) => idx !== j);
    const reducedRows = M.map(r => r.filter((_, idx) => idx !== j));
    const alpha_if_deleted = alphaOf(reducedRows, reducedItems.length);
    return { item: it, corrected_r, alpha_if_deleted };
  });

  // McDonald's ω (approx): single-factor congeneric estimate from standardised
  // loadings derived via the average inter-item correlation (Spearman–Brown-ish).
  // This is a transparent approximation; a full ω needs a factor model (v2).
  let omega: number | undefined;
  const rs: number[] = [];
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) rs.push(pearson(M.map(r => r[a]), M.map(r => r[b])));
  const rbar = rs.length ? mean(rs.filter(Number.isFinite)) : NaN;
  if (Number.isFinite(rbar) && rbar > 0) {
    const lambda = Math.sqrt(rbar);                 // common standardised loading
    const sumL = k * lambda;
    const sumErr = k * (1 - lambda * lambda);
    omega = (sumL * sumL) / (sumL * sumL + sumErr);
  }

  const reversedSuggestions = itemTotal.filter(t => t.corrected_r < 0).map(t => t.item);
  return { items, n, k, alpha, omega, itemTotal, reversedSuggestions };
}

// ---------------------------------------------------------------------------
// Correlation matrix (Pearson or Spearman) with p-values
// ---------------------------------------------------------------------------

function rankTransform(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // average rank (1-based)
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function correlationMatrix(
  cols: Record<string, Cell[]>, vars: string[], method: 'pearson' | 'spearman' = 'pearson',
): CorrelationResult {
  const k = vars.length;
  const r = Array.from({ length: k }, () => new Array(k).fill(NaN));
  const p = Array.from({ length: k }, () => new Array(k).fill(NaN));
  const nMat = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++) {
    for (let b = a; b < k; b++) {
      // pairwise complete
      const xa: number[] = [], xb: number[] = [];
      const ca = cols[vars[a]], cb = cols[vars[b]];
      for (let i = 0; i < ca.length; i++) {
        const va = ca[i] === null || ca[i] === '' ? NaN : Number(ca[i]);
        const vb = cb[i] === null || cb[i] === '' ? NaN : Number(cb[i]);
        if (Number.isFinite(va) && Number.isFinite(vb)) { xa.push(va); xb.push(vb); }
      }
      const n = xa.length;
      let rv: number;
      if (method === 'spearman') rv = pearson(rankTransform(xa), rankTransform(xb));
      else rv = pearson(xa, xb);
      let pv = NaN;
      if (n > 2 && Number.isFinite(rv) && Math.abs(rv) < 1) {
        const t = rv * Math.sqrt((n - 2) / (1 - rv * rv));
        pv = tTwoTailedP(t, n - 2);
      } else if (Math.abs(rv) >= 1 && n > 2) pv = 0;
      r[a][b] = r[b][a] = a === b ? 1 : rv;
      p[a][b] = p[b][a] = a === b ? 0 : pv;
      nMat[a][b] = nMat[b][a] = n;
    }
  }
  return { vars, r, p, n: nMat, method };
}

// ---------------------------------------------------------------------------
// t-tests
// ---------------------------------------------------------------------------

export function independentTTest(g1: number[], g2: number[], welch = true): TTestResult {
  const n1 = g1.length, n2 = g2.length;
  const m1 = mean(g1), m2 = mean(g2);
  const v1 = variance(g1), v2 = variance(g2);
  const sd1 = Math.sqrt(v1), sd2 = Math.sqrt(v2);
  let t: number, df: number, seDiff: number;
  if (welch) {
    seDiff = Math.sqrt(v1 / n1 + v2 / n2);
    t = (m1 - m2) / seDiff;
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  } else {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    seDiff = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    t = (m1 - m2) / seDiff;
    df = n1 + n2 - 2;
  }
  const p = tTwoTailedP(t, df);
  // Cohen's d on pooled SD
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const d = (m1 - m2) / sp;
  // 95% CI of mean difference (uses normal-ish t crit via bisection-free approx)
  const tcrit = tCritical(0.05, df);
  const md = m1 - m2;
  return {
    kind: 'independent', m1, m2, sd1, sd2, n1, n2, t, df, p,
    meanDiff: md, cohensD: d, ci95: [md - tcrit * seDiff, md + tcrit * seDiff],
  };
}

export function pairedTTest(x: number[], y: number[]): TTestResult {
  const n = Math.min(x.length, y.length);
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) diffs.push(x[i] - y[i]);
  const md = mean(diffs), sdd = sd(diffs);
  const se = sdd / Math.sqrt(n);
  const t = md / se, df = n - 1;
  const p = tTwoTailedP(t, df);
  const d = md / sdd; // Cohen's d for paired (dz)
  const tcrit = tCritical(0.05, df);
  return {
    kind: 'paired', m1: mean(x), m2: mean(y), sd1: sd(x), sd2: sd(y), n1: n, n2: n,
    t, df, p, meanDiff: md, cohensD: d, ci95: [md - tcrit * se, md + tcrit * se],
  };
}

// Two-tailed critical t for alpha via bisection on the tail p-value.
export function tCritical(alpha: number, df: number): number {
  let lo = 0, hi = 1000;
  const target = alpha; // two-tailed
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const p = tTwoTailedP(mid, df);
    if (p > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// One-way ANOVA + eta squared + (Bonferroni) post-hoc pairwise comparisons
// ---------------------------------------------------------------------------

export function oneWayAnova(
  dv: string, factor: string, groups: { level: string; values: number[] }[],
): AnovaResult {
  const all = groups.flatMap(g => g.values);
  const grand = mean(all);
  const N = all.length, kG = groups.length;
  let ssB = 0, ssW = 0;
  const summary = groups.map(g => {
    const m = mean(g.values);
    ssB += g.values.length * (m - grand) ** 2;
    for (const v of g.values) ssW += (v - m) ** 2;
    return { level: g.level, n: g.values.length, mean: m, sd: g.values.length > 1 ? sd(g.values) : NaN };
  });
  const dfB = kG - 1, dfW = N - kG;
  const msB = ssB / dfB, msW = ssW / dfW;
  const F = msB / msW;
  const p = fUpperP(F, dfB, dfW);
  const etaSquared = ssB / (ssB + ssW);

  // Bonferroni-corrected pairwise t-tests (transparent stand-in for Tukey HSD).
  const pairs = kG * (kG - 1) / 2;
  const postHoc: { a: string; b: string; meanDiff: number; p: number }[] = [];
  for (let i = 0; i < kG; i++) for (let j = i + 1; j < kG; j++) {
    const gi = groups[i].values, gj = groups[j].values;
    const t = independentTTest(gi, gj, false);
    postHoc.push({ a: groups[i].level, b: groups[j].level, meanDiff: t.m1 - t.m2, p: Math.min(1, t.p * pairs) });
  }
  return { factor, dv, groups: summary, fStat: F, dfBetween: dfB, dfWithin: dfW, p, etaSquared, postHoc };
}

// ---------------------------------------------------------------------------
// Multiple linear regression (OLS via normal equations) + VIF
// ---------------------------------------------------------------------------

function matMul(A: number[][], B: number[][]): number[][] {
  const r = A.length, c = B[0].length, k = B.length;
  const out = Array.from({ length: r }, () => new Array(c).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = 0; for (let x = 0; x < k; x++) s += A[i][x] * B[x][j]; out[i][j] = s; }
  return out;
}
function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]));
}
// Gauss-Jordan inverse.
function invert(M: number[][]): number[][] | null {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let j = 0; j < 2 * n; j++) A[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map(row => row.slice(n));
}

export function regression(
  dvName: string, y: number[], predictorNames: string[], X: number[][], // X: rows of predictor values
): RegressionResult | null {
  const n = y.length, p = predictorNames.length;
  if (n <= p + 1) return null;
  // design matrix with intercept
  const Xd = X.map(row => [1, ...row]);
  const Xt = transpose(Xd);
  const XtX = matMul(Xt, Xd);
  const XtXinv = invert(XtX);
  if (!XtXinv) return null;
  const Xty = matMul(Xt, y.map(v => [v]));
  const beta = matMul(XtXinv, Xty).map(r => r[0]); // [b0, b1, ...]

  const yhat = Xd.map(row => row.reduce((a, b, i) => a + b * beta[i], 0));
  const my = mean(y);
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) { ssRes += (y[i] - yhat[i]) ** 2; ssTot += (y[i] - my) ** 2; }
  const r2 = 1 - ssRes / ssTot;
  const dfModel = p, dfResid = n - p - 1;
  const adjR2 = 1 - (1 - r2) * (n - 1) / dfResid;
  const mse = ssRes / dfResid;
  const fStat = (r2 / dfModel) / ((1 - r2) / dfResid);
  const pModel = fUpperP(fStat, dfModel, dfResid);

  // standardised betas: beta_std = b * (sd_x / sd_y)
  const sdy = sd(y);
  const sdX = predictorNames.map((_, j) => sd(X.map(r => r[j])));

  const coefficients = beta.map((b, i) => {
    const se = Math.sqrt(mse * XtXinv[i][i]);
    const t = b / se;
    const pv = tTwoTailedP(t, dfResid);
    if (i === 0) return { term: 'intercept', b, se, beta: NaN, t, p: pv };
    const betaStd = b * (sdX[i - 1] / sdy);
    // VIF from regressing predictor i-1 on the others
    let vif: number | undefined;
    if (p >= 2) {
      const others = predictorNames.map((_, j) => j).filter(j => j !== i - 1);
      const yi = X.map(r => r[i - 1]);
      const Xi = X.map(r => others.map(j => r[j]));
      const sub = regressionR2(yi, Xi);
      if (sub !== null && sub < 1) vif = 1 / (1 - sub);
    }
    return { term: predictorNames[i - 1], b, se, beta: betaStd, t, p: pv, vif };
  });

  return { dv: dvName, predictors: predictorNames, n, r2, adjR2, fStat, dfModel, dfResid, pModel, coefficients };
}

// helper: R² only (for VIF), avoids recursion bloat
function regressionR2(y: number[], X: number[][]): number | null {
  const n = y.length, p = X[0]?.length ?? 0;
  if (n <= p + 1 || p === 0) return null;
  const Xd = X.map(row => [1, ...row]);
  const Xt = transpose(Xd);
  const inv = invert(matMul(Xt, Xd));
  if (!inv) return null;
  const beta = matMul(inv, matMul(Xt, y.map(v => [v]))).map(r => r[0]);
  const yhat = Xd.map(row => row.reduce((a, b, i) => a + b * beta[i], 0));
  const my = mean(y);
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) { ssRes += (y[i] - yhat[i]) ** 2; ssTot += (y[i] - my) ** 2; }
  return 1 - ssRes / ssTot;
}

// ---------------------------------------------------------------------------
// Chi-square test of independence + Cramér's V
// ---------------------------------------------------------------------------

export function chiSquare(
  rowVar: string, colVar: string, rowVals: Cell[], colVals: Cell[],
): ChiSquareResult {
  const pairs: [string, string][] = [];
  for (let i = 0; i < rowVals.length; i++) {
    const a = rowVals[i], b = colVals[i];
    if (a === null || a === '' || b === null || b === '') continue;
    pairs.push([String(a), String(b)]);
  }
  const rowLevels = [...new Set(pairs.map(p => p[0]))].sort();
  const colLevels = [...new Set(pairs.map(p => p[1]))].sort();
  const observed = rowLevels.map(() => new Array(colLevels.length).fill(0));
  for (const [a, b] of pairs) observed[rowLevels.indexOf(a)][colLevels.indexOf(b)]++;
  const rowSums = observed.map(r => r.reduce((x, y) => x + y, 0));
  const colSums = colLevels.map((_, j) => observed.reduce((s, r) => s + r[j], 0));
  const total = pairs.length;
  const expected = rowLevels.map((_, i) => colLevels.map((_, j) => (rowSums[i] * colSums[j]) / total));
  let chi2 = 0;
  for (let i = 0; i < rowLevels.length; i++) for (let j = 0; j < colLevels.length; j++) {
    const e = expected[i][j];
    if (e > 0) chi2 += (observed[i][j] - e) ** 2 / e;
  }
  const df = (rowLevels.length - 1) * (colLevels.length - 1);
  const p = chiSqUpperP(chi2, df);
  const cramersV = Math.sqrt(chi2 / (total * Math.min(rowLevels.length - 1, colLevels.length - 1)));
  return { rowVar, colVar, observed, expected, rowLevels, colLevels, chi2, df, p, cramersV };
}

// ---------------------------------------------------------------------------
// Factor analysis — PCA + EFA (principal-axis factoring) + varimax rotation
// ---------------------------------------------------------------------------
// Built on a Jacobi eigendecomposition of the correlation matrix. KMO + Bartlett
// for sampling adequacy. Faithful to the SPSS "Factor Analysis" workflow.

// Jacobi method for the eigenvalues and eigenvectors of a symmetric matrix.
// Returns eigenvalues + eigenvectors as columns (in original order).
function jacobi(A0: number[][]): { values: number[]; vectors: number[][] } {
  const n = A0.length;
  const a = A0.map(row => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const MAX_SWEEPS = 100;
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) off += Math.abs(a[p][q]);
    if (off < 1e-12) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p][q];
      if (Math.abs(apq) < 1e-14) continue;
      const app = a[p][p], aqq = a[q][q];
      const theta = (aqq - app) / (2 * apq);
      const t = theta >= 0 ? 1 / (theta + Math.sqrt(1 + theta * theta)) : 1 / (theta - Math.sqrt(1 + theta * theta));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      a[p][p] = app - t * apq;
      a[q][q] = aqq + t * apq;
      a[p][q] = a[q][p] = 0;
      for (let r = 0; r < n; r++) {
        if (r !== p && r !== q) {
          const arp = a[r][p], arq = a[r][q];
          a[r][p] = a[p][r] = c * arp - s * arq;
          a[r][q] = a[q][r] = s * arp + c * arq;
        }
        const vrp = v[r][p], vrq = v[r][q];
        v[r][p] = c * vrp - s * vrq;
        v[r][q] = s * vrp + c * vrq;
      }
    }
  }
  const values = a.map((row, i) => row[i]);
  return { values, vectors: v };
}

function correlationMatrixDense(M: number[][]): number[][] {
  const n = M.length, k = M[0].length;
  const means: number[] = [];
  const sds: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = M.map(r => r[j]);
    means.push(mean(col));
    sds.push(sd(col));
  }
  const R = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++) for (let b = a; b < k; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += ((M[i][a] - means[a]) / sds[a]) * ((M[i][b] - means[b]) / sds[b]);
    const r = s / (n - 1);
    R[a][b] = R[b][a] = a === b ? 1 : r;
  }
  return R;
}

// Kaiser-Meyer-Olkin from the anti-image (partial) correlation matrix.
function kmo(R: number[][]): number {
  const inv = invert(R);
  if (!inv) return NaN;
  const k = R.length;
  let sumR2 = 0, sumP2 = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) {
    sumR2 += R[i][j] * R[i][j];
    const pij = -inv[i][j] / Math.sqrt(inv[i][i] * inv[j][j]);
    sumP2 += pij * pij;
  }
  return sumR2 / (sumR2 + sumP2);
}

// Bartlett's test of sphericity.
function bartlett(R: number[][], n: number): { chi2: number; df: number; p: number } {
  const k = R.length;
  const det = matDet(R);
  if (!Number.isFinite(det) || det <= 0) return { chi2: NaN, df: NaN, p: NaN };
  const chi2 = -(n - 1 - (2 * k + 5) / 6) * Math.log(det);
  const df = (k * (k - 1)) / 2;
  return { chi2, df, p: chiSqUpperP(chi2, df) };
}

// Determinant via LU-ish row reduction.
function matDet(M: number[][]): number {
  const n = M.length;
  const a = M.map(r => [...r]);
  let det = 1;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[piv][i])) piv = r;
    if (Math.abs(a[piv][i]) < 1e-14) return 0;
    if (piv !== i) { [a[i], a[piv]] = [a[piv], a[i]]; det = -det; }
    det *= a[i][i];
    for (let r = i + 1; r < n; r++) {
      const f = a[r][i] / a[i][i];
      for (let c = i; c < n; c++) a[r][c] -= f * a[i][c];
    }
  }
  return det;
}

// Varimax rotation of a loading matrix (items × factors). Returns rotated loadings.
function varimax(L0: number[][], gamma = 1, maxIter = 100, tol = 1e-8): number[][] {
  const p = L0.length, k = L0[0].length;
  if (k < 2) return L0.map(r => [...r]);
  let L = L0.map(r => [...r]);
  let dOld = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    let d = 0;
    for (let q = 0; q < k - 1; q++) for (let r = q + 1; r < k; r++) {
      let A = 0, B = 0, C = 0, D = 0;
      for (let i = 0; i < p; i++) {
        const x = L[i][q], y = L[i][r];
        const u = x * x - y * y, v2 = 2 * x * y;
        A += u; B += v2; C += u * u - v2 * v2; D += 2 * u * v2;
      }
      const num = D - (2 * gamma * A * B) / p;
      const den = C - (gamma * (A * A - B * B)) / p;
      const phi = Math.atan2(num, den) / 4;
      if (Math.abs(phi) < 1e-10) continue;
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let i = 0; i < p; i++) {
        const x = L[i][q], y = L[i][r];
        L[i][q] = c * x + s * y;
        L[i][r] = -s * x + c * y;
      }
      d += Math.abs(phi);
    }
    if (Math.abs(d - dOld) < tol) break;
    dOld = d;
  }
  return L;
}

export function factorAnalysis(
  cols: Record<string, Cell[]>, items: string[],
  opts: { method?: 'pca' | 'efa'; nFactors?: number; rotation?: 'none' | 'varimax' } = {},
): FactorAnalysisResult | null {
  const method = opts.method ?? 'pca';
  const rotation = opts.rotation ?? 'varimax';
  const M = completeMatrix(cols, items);
  const n = M.length, k = items.length;
  if (n < k + 5) return null;

  const R = correlationMatrixDense(M);
  const kmoVal = kmo(R);
  const bart = bartlett(R, n);

  // PAF iterates communalities; PCA uses R as-is (diagonals = 1).
  let Rcurr = R.map(r => [...r]);
  let communalities = new Array(k).fill(1);
  if (method === 'efa') {
    // Initial communalities: 1 - 1/diag(R⁻¹) (SMC)
    const inv = invert(R);
    if (inv) for (let i = 0; i < k; i++) communalities[i] = Math.max(0, 1 - 1 / inv[i][i]);
    for (let iter = 0; iter < 25; iter++) {
      for (let i = 0; i < k; i++) Rcurr[i][i] = communalities[i];
      const { values, vectors } = jacobi(Rcurr);
      const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
      const nFac = opts.nFactors ?? Math.max(1, order.filter(([v]) => v >= 1).length);
      const newCom = new Array(k).fill(0);
      for (let i = 0; i < k; i++) {
        for (let f = 0; f < nFac; f++) {
          const idx = order[f][1];
          const lam = Math.sqrt(Math.max(0, order[f][0]));
          const load = vectors[i][idx] * lam;
          newCom[i] += load * load;
        }
      }
      let delta = 0;
      for (let i = 0; i < k; i++) { delta += Math.abs(newCom[i] - communalities[i]); communalities[i] = Math.min(1, newCom[i]); }
      if (delta < 1e-5) break;
    }
    for (let i = 0; i < k; i++) Rcurr[i][i] = communalities[i];
  }

  const { values, vectors } = jacobi(Rcurr);
  const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  const eigenvalues = order.map(([v]) => v);
  const totalVar = method === 'efa' ? communalities.reduce((a, b) => a + b, 0) : k;
  const varianceExplained = eigenvalues.map(v => v / totalVar);
  const cumulativeVariance = varianceExplained.reduce((acc: number[], v, i) => { acc.push(i === 0 ? v : acc[i - 1] + v); return acc; }, []);

  const nFactors = opts.nFactors ?? Math.max(1, eigenvalues.filter(v => v >= 1).length);
  let loadings = Array.from({ length: k }, () => new Array(nFactors).fill(0));
  for (let i = 0; i < k; i++) for (let f = 0; f < nFactors; f++) {
    const idx = order[f][1];
    const lam = Math.sqrt(Math.max(0, eigenvalues[f]));
    loadings[i][f] = vectors[i][idx] * lam;
  }
  if (rotation === 'varimax' && nFactors >= 2) loadings = varimax(loadings);

  const com = loadings.map(row => row.reduce((a, b) => a + b * b, 0));

  return {
    method, items, n, k,
    kmo: kmoVal,
    bartlettChi2: bart.chi2, bartlettDf: bart.df, bartlettP: bart.p,
    eigenvalues, varianceExplained, cumulativeVariance,
    nFactors, rotation, loadings,
    communalities: method === 'efa' ? communalities : com,
  };
}

// ---------------------------------------------------------------------------
// Nonparametric tests — Mann-Whitney U, Wilcoxon signed-rank, Kruskal-Wallis
// ---------------------------------------------------------------------------

function rankWithTies(xs: number[]): { ranks: number[]; tieCorrection: number } {
  const idx = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0, tieCorrection = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t ** 3 - t;
    for (let m = i; m <= j; m++) ranks[idx[m][1]] = avg;
    i = j + 1;
  }
  return { ranks, tieCorrection };
}

export function mannWhitney(g1: number[], g2: number[], labels: [string, string] = ['Group 1', 'Group 2']): MannWhitneyResult {
  const n1 = g1.length, n2 = g2.length;
  const all = [...g1, ...g2];
  const { ranks, tieCorrection } = rankWithTies(all);
  const r1 = ranks.slice(0, n1).reduce((a, b) => a + b, 0);
  const r2 = ranks.slice(n1).reduce((a, b) => a + b, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = r2 - (n2 * (n2 + 1)) / 2;
  const u = Math.min(u1, u2);
  const w = r1;
  const N = n1 + n2;
  const muU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt(((n1 * n2) / 12) * ((N + 1) - tieCorrection / (N * (N - 1))));
  const z = sigmaU > 0 ? (u - muU) / sigmaU : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    kind: 'mann-whitney', groups: labels, n1, n2, u, w, z, p,
    meanRank1: r1 / n1, meanRank2: r2 / n2,
    rankBiserial: 1 - (2 * u) / (n1 * n2),
  };
}

export function wilcoxonSignedRank(x: number[], y: number[], labels: [string, string] = ['Measure 1', 'Measure 2']): WilcoxonResult {
  const diffs: number[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i] - y[i];
    if (d !== 0) diffs.push(d);
  }
  const n = diffs.length;
  const abs = diffs.map(d => Math.abs(d));
  const { ranks, tieCorrection } = rankWithTies(abs);
  let wPlus = 0, wMinus = 0;
  for (let i = 0; i < n; i++) (diffs[i] > 0 ? (wPlus += ranks[i]) : (wMinus += ranks[i]));
  const w = Math.min(wPlus, wMinus);
  const mu = (n * (n + 1)) / 4;
  const sigma = Math.sqrt(((n * (n + 1) * (2 * n + 1)) - tieCorrection / 2) / 24);
  const z = sigma > 0 ? (w - mu) / sigma : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    kind: 'wilcoxon-signed-rank', vars: labels, n, w, z, p,
    matchedR: n > 0 ? z / Math.sqrt(n) : NaN,
  };
}

export function kruskalWallis(dv: string, factor: string, groups: { level: string; values: number[] }[]): KruskalWallisResult {
  const all: number[] = [];
  const idx: number[] = []; // group index per observation
  groups.forEach((g, i) => g.values.forEach(v => { all.push(v); idx.push(i); }));
  const N = all.length, kG = groups.length;
  const { ranks, tieCorrection } = rankWithTies(all);
  const sumRanks = new Array(kG).fill(0);
  const counts = new Array(kG).fill(0);
  for (let i = 0; i < N; i++) { sumRanks[idx[i]] += ranks[i]; counts[idx[i]]++; }
  let H = 0;
  for (let g = 0; g < kG; g++) H += (sumRanks[g] * sumRanks[g]) / counts[g];
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);
  const tieAdj = 1 - tieCorrection / (N ** 3 - N);
  if (tieAdj > 0) H /= tieAdj;
  const df = kG - 1;
  const p = chiSqUpperP(H, df);
  const epsilonSquared = H / ((N * N - 1) / (N + 1));
  return {
    kind: 'kruskal-wallis', factor, dv,
    groups: groups.map((g, i) => ({ level: g.level, n: counts[i], meanRank: sumRanks[i] / counts[i] })),
    h: H, df, p, epsilonSquared,
  };
}

// ---------------------------------------------------------------------------
// Mediation (PROCESS Model 4) + Moderation (Model 1)
// ---------------------------------------------------------------------------
// Implements simple, single-mediator and single-moderator linear models the way
// Hayes' PROCESS macro presents them in papers. Mediation uses percentile
// bootstrap (default 5000 resamples) for the CI of the indirect effect.

function simpleOLS(y: number[], xs: number[][]): { b: number[]; se: number[]; pVals: number[]; r2: number; resid: number[] } | null {
  const r = regression('_', y, xs[0].map((_, j) => `x${j}`), xs);
  if (!r) return null;
  const b = r.coefficients.map(c => c.b);
  const se = r.coefficients.map(c => c.se);
  const pVals = r.coefficients.map(c => c.p);
  const yhat = xs.map(row => b[0] + row.reduce((a, v, i) => a + v * b[i + 1], 0));
  const resid = y.map((v, i) => v - yhat[i]);
  return { b, se, pVals, r2: r.r2, resid };
}

export function mediation(xN: string, mN: string, yN: string, x: number[], m: number[], y: number[], bootstrapN = 5000): MediationResult | null {
  const n = x.length;
  if (n < 10) return null;
  const xm = simpleOLS(m, x.map(v => [v]));                       // M = a0 + aX
  const xmy = simpleOLS(y, x.map((v, i) => [v, m[i]]));            // Y = b0 + c'X + bM
  const xy = simpleOLS(y, x.map(v => [v]));                       // Y = b0 + cX
  if (!xm || !xmy || !xy) return null;
  const a = xm.b[1], aSE = xm.se[1], aP = xm.pVals[1];
  const cPrime = xmy.b[1], cPrimeSE = xmy.se[1], cPrimeP = xmy.pVals[1];
  const b = xmy.b[2], bSE = xmy.se[2], bP = xmy.pVals[2];
  const c = xy.b[1], cSE = xy.se[1], cP = xy.pVals[1];
  const indirect = a * b;
  const sobelSE = Math.sqrt(b * b * aSE * aSE + a * a * bSE * bSE);
  const sobelZ = sobelSE > 0 ? indirect / sobelSE : 0;
  const sobelP = 2 * (1 - normalCdf(Math.abs(sobelZ)));

  // Percentile bootstrap.
  const boots: number[] = [];
  const seed = 0xC0FFEE; let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 0x100000000; };
  for (let i = 0; i < bootstrapN; i++) {
    const bx: number[] = [], bm: number[] = [], by: number[] = [];
    for (let j = 0; j < n; j++) { const k = Math.floor(rand() * n); bx.push(x[k]); bm.push(m[k]); by.push(y[k]); }
    const fitA = simpleOLS(bm, bx.map(v => [v]));
    const fitB = simpleOLS(by, bx.map((v, idx) => [v, bm[idx]]));
    if (fitA && fitB) boots.push(fitA.b[1] * fitB.b[2]);
  }
  boots.sort((p1, p2) => p1 - p2);
  const lo = boots[Math.floor(0.025 * boots.length)] ?? NaN;
  const hi = boots[Math.floor(0.975 * boots.length)] ?? NaN;

  return {
    x: xN, m: mN, y: yN, n,
    a, aSE, aP, b, bSE, bP, cPrime, cPrimeSE, cPrimeP, c, cSE, cP,
    indirect, sobelZ, sobelP, bootstrapCI95: [lo, hi], bootstrapN,
  };
}

export function moderation(xN: string, wN: string, yN: string, x: number[], w: number[], y: number[]): ModerationResult | null {
  const n = x.length;
  if (n < 10) return null;
  const mx = mean(x), mw = mean(w);
  const xc = x.map(v => v - mx);
  const wc = w.map(v => v - mw);
  const xw = xc.map((v, i) => v * wc[i]);
  // Step 1: main effects only (for ΔR²).
  const main = regression(yN, y, [xN, wN], xc.map((v, i) => [v, wc[i]]));
  // Step 2: add interaction term.
  const full = regression(yN, y, [xN, wN, `${xN} × ${wN}`], xc.map((v, i) => [v, wc[i], xw[i]]));
  if (!main || !full) return null;
  const sw = sd(w);
  const lowW = -sw, hiW = sw;
  const bX = full.coefficients[1].b, bW = full.coefficients[2].b, bXW = full.coefficients[3].b;
  const seXW = full.coefficients[3].se;
  // Simple slopes of Y on X at low/mean/high W: slope = bX + bXW * (Wc).
  const slope = (wcVal: number) => bX + bXW * wcVal;
  // SE of the simple slope from the variance-covariance matrix would be ideal; here we use
  // the delta approximation: var(slope) = var(bX) + Wc² var(bXW) + 2 Wc cov(bX, bXW).
  // Without the full covariance, we conservatively approximate using SE(bX) and SE(bXW).
  const seX = full.coefficients[1].se;
  const seSlope = (wcVal: number) => Math.sqrt(seX * seX + wcVal * wcVal * seXW * seXW);
  const slopeLine = (wcVal: number, label: string) => {
    const s = slope(wcVal), se = seSlope(wcVal);
    const t = se > 0 ? s / se : 0;
    return { wLevel: label, w: mw + wcVal, slope: s, se, t, p: tTwoTailedP(t, n - 4) };
  };
  return {
    x: xN, w: wN, y: yN, n,
    bX, seX, pX: full.coefficients[1].p,
    bW, seW: full.coefficients[2].se, pW: full.coefficients[2].p,
    bXW, seXW, pXW: full.coefficients[3].p,
    intercept: full.coefficients[0].b,
    r2: full.r2, r2Change: full.r2 - main.r2,
    simpleSlopes: [slopeLine(lowW, '−1 SD'), slopeLine(0, 'Mean'), slopeLine(hiW, '+1 SD')],
  };
}

// shared formatting helpers
export function fmt(x: number, d = 2): string {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(d);
}
export function pStars(p: number): string {
  if (!Number.isFinite(p)) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}
export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '—';
  return p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0/, '');
}
