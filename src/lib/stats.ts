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
