// A library of SIMULATED teaching datasets so researchers always have
// something realistic to practise every analysis on. These are not real
// study data — each is generated from a seeded RNG with a known structure,
// and every name carries "(simulated)" so it can never be mistaken for
// empirical data. The structures are designed so the intended analysis
// actually shows the intended effect (a real t-test difference, a real
// mediation chain, a genuine interaction, etc.).

import type { Dataset, Cell, Variable, VarType } from './types';
import { buildDemo } from './demo';

type Row = Record<string, Cell>;

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(rng: () => number): number {
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
// latent → Likert response
function lik(latent: number, rng: () => number, noise = 0.9, min = 1, max = 7) {
  return clamp(Math.round((min + max) / 2 + latent * 1.1 + randn(rng) * noise), min, max);
}
function pick<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }

interface Spec { type: VarType; likertMin?: number; likertMax?: number }
function buildVars(header: string[], spec: Record<string, Spec>, rows: Row[]): Variable[] {
  return header.map(name => {
    const s = spec[name] ?? { type: 'numeric' };
    const missing = rows.filter(r => r[name] === null || r[name] === undefined || (r[name] as unknown) === '').length;
    const v: Variable = { name, type: s.type, missing };
    if (s.type === 'categorical') {
      v.levels = [...new Set(rows.map(r => r[name]).filter(x => x !== null && x !== undefined && x !== ''))]
        .sort() as (string | number)[];
    } else if (s.type === 'likert') {
      const lo = s.likertMin ?? 1, hi = s.likertMax ?? 7;
      v.likertMin = lo; v.likertMax = hi;
      v.levels = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    return v;
  });
}
function ds(name: string, header: string[], spec: Record<string, Spec>, rows: Row[]): Dataset {
  return { name, source: 'demo', variables: buildVars(header, spec, rows), rows };
}

// ── Education: motivation, anxiety → GPA (N=200) ────────────────────
function buildEducation(): Dataset {
  const rng = mulberry32(101);
  const header = ['id', 'age', 'gender', 'school_type', 'study_hours',
    'motiv_1', 'motiv_2', 'motiv_3', 'motiv_4', 'anxiety_1', 'anxiety_2', 'anxiety_3', 'gpa'];
  const rows: Row[] = [];
  for (let i = 0; i < 200; i++) {
    const motiv = randn(rng);
    const anx = randn(rng);
    const hours = clamp(Math.round(12 + motiv * 4 + randn(rng) * 5), 0, 40);
    const m = [0, 0, 0, 0].map(() => lik(motiv, rng));
    const a = [0, 0, 0].map(() => lik(anx, rng));
    const gpa = clamp(+(2.6 + 0.45 * motiv + 0.02 * hours - 0.30 * anx + randn(rng) * 0.3).toFixed(2), 0, 4);
    rows.push({
      id: i + 1, age: clamp(Math.round(20 + randn(rng) * 2), 17, 30),
      gender: pick(rng, ['Female', 'Male', 'Non-binary']),
      school_type: rng() < 0.5 ? 'Public' : 'Private', study_hours: hours,
      motiv_1: m[0], motiv_2: m[1], motiv_3: m[2], motiv_4: m[3],
      anxiety_1: a[0], anxiety_2: a[1], anxiety_3: a[2], gpa,
    });
  }
  return ds('Student motivation & achievement (simulated, N=200)', header, {
    id: { type: 'id' }, age: { type: 'numeric' }, gender: { type: 'categorical' },
    school_type: { type: 'categorical' }, study_hours: { type: 'numeric' },
    motiv_1: { type: 'likert' }, motiv_2: { type: 'likert' }, motiv_3: { type: 'likert' }, motiv_4: { type: 'likert' },
    anxiety_1: { type: 'likert' }, anxiety_2: { type: 'likert' }, anxiety_3: { type: 'likert' }, gpa: { type: 'numeric' },
  }, rows);
}

// ── Health: mindfulness intervention vs control (N=160) ─────────────
function buildWellbeing(): Dataset {
  const rng = mulberry32(202);
  const header = ['id', 'age', 'condition', 'stress_1', 'stress_2', 'stress_3', 'stress_4',
    'sleep_quality', 'wellbeing_1', 'wellbeing_2', 'wellbeing_3', 'wellbeing_4', 'wellbeing_5'];
  const rows: Row[] = [];
  for (let i = 0; i < 160; i++) {
    const treat = rng() < 0.5;
    const wbLatent = (treat ? 0.6 : -0.2) + randn(rng) * 0.8;
    const stLatent = (treat ? -0.5 : 0.2) + randn(rng) * 0.8;
    const st = [0, 0, 0, 0].map(() => lik(stLatent, rng));
    const wb = [0, 0, 0, 0, 0].map(() => lik(wbLatent, rng));
    rows.push({
      id: i + 1, age: clamp(Math.round(35 + randn(rng) * 9), 18, 70),
      condition: treat ? 'Mindfulness' : 'Control',
      stress_1: st[0], stress_2: st[1], stress_3: st[2], stress_4: st[3],
      sleep_quality: clamp(+(6 + (treat ? 1.2 : 0) + randn(rng) * 1.6).toFixed(1), 0, 10),
      wellbeing_1: wb[0], wellbeing_2: wb[1], wellbeing_3: wb[2], wellbeing_4: wb[3], wellbeing_5: wb[4],
    });
  }
  const spec: Record<string, Spec> = { id: { type: 'id' }, age: { type: 'numeric' }, condition: { type: 'categorical' }, sleep_quality: { type: 'numeric' } };
  ['stress_1', 'stress_2', 'stress_3', 'stress_4', 'wellbeing_1', 'wellbeing_2', 'wellbeing_3', 'wellbeing_4', 'wellbeing_5'].forEach(k => spec[k] = { type: 'likert' });
  return ds('Wellbeing intervention — mindfulness vs control (simulated, N=160)', header, spec, rows);
}

// ── Marketing: ad exposure → attitude → trust → purchase (N=220) ────
function buildConsumer(): Dataset {
  const rng = mulberry32(303);
  const header = ['id', 'ad_exposure', 'attitude_1', 'attitude_2', 'attitude_3',
    'trust_1', 'trust_2', 'trust_3', 'purchase_intent'];
  const rows: Row[] = [];
  for (let i = 0; i < 220; i++) {
    const high = rng() < 0.5;
    const att = (high ? 0.5 : -0.3) + randn(rng) * 0.8;
    const trust = 0.6 * att + randn(rng) * 0.7;          // attitude → trust
    const intent = clamp(Math.round(4 + 0.6 * trust + 0.4 * att + randn(rng) * 0.9), 1, 7); // both → intent
    const at = [0, 0, 0].map(() => lik(att, rng));
    const tr = [0, 0, 0].map(() => lik(trust, rng));
    rows.push({
      id: i + 1, ad_exposure: high ? 'High' : 'Low',
      attitude_1: at[0], attitude_2: at[1], attitude_3: at[2],
      trust_1: tr[0], trust_2: tr[1], trust_3: tr[2], purchase_intent: intent,
    });
  }
  const spec: Record<string, Spec> = { id: { type: 'id' }, ad_exposure: { type: 'categorical' }, purchase_intent: { type: 'numeric' } };
  ['attitude_1', 'attitude_2', 'attitude_3', 'trust_1', 'trust_2', 'trust_3'].forEach(k => spec[k] = { type: 'likert' });
  return ds('Consumer attitudes — exposure → trust → purchase (simulated, N=220)', header, spec, rows);
}

// ── Experiment: 2×2 framing × incentive → decision score (N=160) ────
function buildExperiment(): Dataset {
  const rng = mulberry32(404);
  const header = ['id', 'framing', 'incentive', 'decision_score'];
  const rows: Row[] = [];
  for (let i = 0; i < 160; i++) {
    const gain = rng() < 0.5;       // framing
    const inc = rng() < 0.5;        // incentive
    // main effects + a real interaction (incentive helps more under gain framing)
    const score = 50 + (gain ? 6 : 0) + (inc ? 4 : 0) + (gain && inc ? 5 : 0) + randn(rng) * 8;
    rows.push({
      id: i + 1, framing: gain ? 'Gain' : 'Loss', incentive: inc ? 'Incentive' : 'None',
      decision_score: +score.toFixed(1),
    });
  }
  return ds('2×2 experiment — framing × incentive (simulated, N=160)', header, {
    id: { type: 'id' }, framing: { type: 'categorical' }, incentive: { type: 'categorical' }, decision_score: { type: 'numeric' },
  }, rows);
}

// ── Longitudinal: 3-wave wellbeing panel, wide format (N=120) ───────
function buildPanel(): Dataset {
  const rng = mulberry32(505);
  const header = ['id', 'group', 'wellbeing_w1', 'wellbeing_w2', 'wellbeing_w3'];
  const rows: Row[] = [];
  for (let i = 0; i < 120; i++) {
    const treat = rng() < 0.5;
    const base = 4.5 + randn(rng) * 0.8;
    const slope = (treat ? 0.5 : 0.05);
    rows.push({
      id: i + 1, group: treat ? 'Treatment' : 'Control',
      wellbeing_w1: +clamp(base + randn(rng) * 0.3, 1, 7).toFixed(2),
      wellbeing_w2: +clamp(base + slope + randn(rng) * 0.3, 1, 7).toFixed(2),
      wellbeing_w3: +clamp(base + 2 * slope + randn(rng) * 0.3, 1, 7).toFixed(2),
    });
  }
  return ds('3-wave wellbeing panel — wide format (simulated, N=120)', header, {
    id: { type: 'id' }, group: { type: 'categorical' },
    wellbeing_w1: { type: 'numeric' }, wellbeing_w2: { type: 'numeric' }, wellbeing_w3: { type: 'numeric' },
  }, rows);
}

// ── Messy data for cleaning practice (N=150) ────────────────────────
// Deliberately imperfect: missing cells, inconsistent category labels, a
// free-text column. For practising the Data tab's type detection + cleaning.
function buildMessy(): Dataset {
  const rng = mulberry32(606);
  const header = ['id', 'age', 'gender', 'income', 'satisfaction', 'comments'];
  const genders = ['Male', 'male', 'M', 'Female', 'female', 'F', ''];
  const notes = ['', 'great service', 'too slow', 'would recommend', '', 'needs work', 'happy overall', ''];
  const rows: Row[] = [];
  for (let i = 0; i < 150; i++) {
    rows.push({
      id: i + 1,
      age: rng() < 0.08 ? null : clamp(Math.round(30 + randn(rng) * 11), 18, 80),
      gender: pick(rng, genders) || null,
      income: rng() < 0.12 ? null : Math.round(clamp(45000 + randn(rng) * 18000, 12000, 200000) / 100) * 100,
      satisfaction: rng() < 0.10 ? null : clamp(Math.round(3 + randn(rng) * 1.2), 1, 5),
      comments: pick(rng, notes) || null,
    });
  }
  return ds('Messy data for cleaning practice (simulated, N=150)', header, {
    id: { type: 'id' }, age: { type: 'numeric' }, gender: { type: 'categorical' },
    income: { type: 'numeric' }, satisfaction: { type: 'likert', likertMin: 1, likertMax: 5 }, comments: { type: 'text' },
  }, rows);
}

export interface SampleDataset {
  id: string;
  name: string;
  domain: string;
  description: string;
  bestFor: string;       // which analyses it's built to demonstrate
  build: () => Dataset;
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  { id: 'employee', name: 'Employee survey', domain: 'Org / IO', bestFor: 'Reliability · t-test · ANOVA · regression',
    description: 'Job satisfaction & engagement scales, an experimental condition, department, and turnover intention.', build: buildDemo },
  { id: 'education', name: 'Student motivation & achievement', domain: 'Education', bestFor: 'Correlation · multiple regression',
    description: 'Motivation & test-anxiety scales, study hours, and GPA — built so motivation and hours predict GPA and anxiety dampens it.', build: buildEducation },
  { id: 'wellbeing', name: 'Wellbeing intervention', domain: 'Health', bestFor: 't-test · ANOVA · reliability',
    description: 'Mindfulness vs control, with stress and wellbeing scales plus sleep quality — a clean between-groups difference.', build: buildWellbeing },
  { id: 'consumer', name: 'Consumer attitudes', domain: 'Marketing', bestFor: 'Mediation (Model 4) · regression',
    description: 'Ad exposure → brand attitude → trust → purchase intention — a built-in mediation chain.', build: buildConsumer },
  { id: 'experiment', name: '2×2 experiment', domain: 'Experimental', bestFor: 'Two-way ANOVA · interaction',
    description: 'Gain/Loss framing crossed with incentive, with a real framing×incentive interaction on the decision score.', build: buildExperiment },
  { id: 'panel', name: '3-wave wellbeing panel', domain: 'Longitudinal', bestFor: 'Paired t-test · repeated measures',
    description: 'Wide-format wellbeing across three waves; the treatment group rises over time while control stays flat.', build: buildPanel },
  { id: 'messy', name: 'Messy data for cleaning', domain: 'Data cleaning', bestFor: 'Type detection · handling missingness',
    description: 'Missing cells, inconsistent gender labels (M/male/Male…), and a free-text column — practice cleaning before analysis.', build: buildMessy },
];
