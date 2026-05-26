// A deterministic demo dataset so ToolsScope is useful the instant it loads
// (and a stable fixture for sanity-checking analyses). Mimics a cleaned Cadence
// export: demographics, two multi-item Likert scales, an experimental condition,
// a department factor, and a continuous outcome built to correlate with the
// scales — so every v1 analysis has something real to chew on.

import type { Dataset, Cell, Variable } from './types';

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// standard normal via Box–Muller
function randn(rng: () => number): number {
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function likert(latent: number, noise: number, rng: () => number, min = 1, max = 7): number {
  const raw = Math.round(4 + latent * 1.1 + randn(rng) * noise);
  return Math.max(min, Math.min(max, raw));
}

export function buildDemo(): Dataset {
  const rng = mulberry32(20260526);
  const N = 180;
  const genders = ['Female', 'Male', 'Non-binary'];
  const depts = ['Engineering', 'Sales', 'Operations'];

  const header = [
    'id', 'age', 'gender', 'condition', 'department',
    'jobsat_1', 'jobsat_2', 'jobsat_3', 'jobsat_4',
    'engage_1', 'engage_2', 'engage_3',
    'turnover_intent',
  ];

  const rows: Record<string, Cell>[] = [];
  for (let i = 0; i < N; i++) {
    const treatment = rng() < 0.5;
    const deptIdx = Math.floor(rng() * 3);
    // latent satisfaction: treatment + dept effect
    const satLatent = (treatment ? 0.5 : -0.2) + (deptIdx === 0 ? 0.4 : deptIdx === 1 ? -0.3 : 0) + randn(rng) * 0.8;
    const engLatent = satLatent * 0.7 + randn(rng) * 0.7;
    const age = Math.max(21, Math.min(63, Math.round(34 + randn(rng) * 8)));

    const js = [0, 0, 0, 0].map(() => likert(satLatent, 0.9, rng));
    const en = [0, 0, 0].map(() => likert(engLatent, 0.9, rng));
    const satMean = js.reduce((a, b) => a + b, 0) / 4;
    const engMean = en.reduce((a, b) => a + b, 0) / 3;
    // turnover intention falls as satisfaction/engagement rise
    const turnover = Math.max(1, Math.min(7,
      Math.round(8 - 0.5 * satMean - 0.4 * engMean + 0.02 * (age - 34) + randn(rng) * 0.9)));

    rows.push({
      id: i + 1,
      age,
      gender: genders[Math.floor(rng() * 3)],
      condition: treatment ? 'Treatment' : 'Control',
      department: depts[deptIdx],
      jobsat_1: js[0], jobsat_2: js[1], jobsat_3: js[2], jobsat_4: js[3],
      engage_1: en[0], engage_2: en[1], engage_3: en[2],
      turnover_intent: turnover,
    });
  }

  const variables: Variable[] = header.map(name => {
    if (name === 'id') return { name, type: 'id', missing: 0 };
    if (name === 'age' || name === 'turnover_intent') {
      return { name, type: 'numeric', missing: 0 };
    }
    if (name === 'gender' || name === 'condition' || name === 'department') {
      const levels = [...new Set(rows.map(r => r[name] as string))].sort();
      return { name, type: 'categorical', levels, missing: 0 };
    }
    // likert items
    return { name, type: 'likert', missing: 0, likertMin: 1, likertMax: 7, levels: [1, 2, 3, 4, 5, 6, 7] };
  });

  return { name: 'Demo — employee survey (N=180)', source: 'demo', variables, rows };
}
