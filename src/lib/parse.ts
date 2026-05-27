// Data ingest — turn a cleaned CSV/TSV/XLSX file (or pasted text) into a typed
// Dataset. CSV/TSV is parsed natively; XLSX is read via SheetJS. Variable types
// are auto-detected (numeric / likert / categorical / text / id) and remain
// user-overridable in the Data view.

import type { Cell, Dataset, Variable, VarType } from './types';

// ---- delimited text ----------------------------------------------------------

// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas/quotes).
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? sniffDelimiter(text);
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore, handle \r\n */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''));
}

function sniffDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] ?? '';
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

// ---- XLSX --------------------------------------------------------------------

// Lazy-loaded: the SheetJS bundle is large, so it's only pulled in when the user
// actually uploads an Excel file (keeps the initial app bundle small).
export async function parseXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: true, defval: '' });
  return aoa.map(r => r.map(c => (c === null || c === undefined ? '' : String(c))));
}

// ---- type detection + Dataset assembly --------------------------------------

function detectType(name: string, values: string[]): { type: VarType; min?: number; max?: number; levels?: (string | number)[] } {
  const nonBlank = values.filter(v => v !== '' && v != null);
  if (nonBlank.length === 0) return { type: 'text' };

  const lname = name.toLowerCase();
  if (/^(id|pid|respondent|participant|case|uuid|code)$/.test(lname) || lname.endsWith('_id')) {
    return { type: 'id' };
  }

  const nums = nonBlank.map(Number);
  const allNumeric = nums.every(Number.isFinite);
  if (allNumeric) {
    const distinct = [...new Set(nums)].sort((a, b) => a - b);
    const min = distinct[0], max = distinct[distinct.length - 1];
    // Likert: small set of consecutive-ish integers within a 2–11 point band.
    const allInts = distinct.every(n => Number.isInteger(n));
    if (allInts && distinct.length <= 11 && max - min <= 10 && min >= 0 && distinct.length >= 2) {
      return { type: 'likert', min, max, levels: distinct };
    }
    return { type: 'numeric', min, max };
  }
  // Non-numeric → categorical if few distinct values, else free text.
  const distinct = [...new Set(nonBlank)];
  if (distinct.length <= Math.max(12, nonBlank.length * 0.25)) {
    return { type: 'categorical', levels: distinct.sort() };
  }
  return { type: 'text', levels: undefined };
}

export function buildDataset(matrix: string[][], name: string, source: Dataset['source']): Dataset {
  if (matrix.length < 2) throw new Error('Need a header row and at least one data row.');
  const header = matrix[0].map((h, i) => (h && h.trim()) || `V${i + 1}`);
  const body = matrix.slice(1);

  const variables: Variable[] = header.map((h, col) => {
    const raw = body.map(r => (r[col] ?? '').trim());
    const det = detectType(h, raw);
    const missing = raw.filter(v => v === '').length;
    return {
      name: h,
      type: det.type,
      levels: det.levels,
      missing,
      likertMin: det.type === 'likert' ? det.min : undefined,
      likertMax: det.type === 'likert' ? det.max : undefined,
    };
  });

  const rows: Record<string, Cell>[] = body.map(r => {
    const obj: Record<string, Cell> = {};
    header.forEach((h, col) => {
      const v = (r[col] ?? '').trim();
      const t = variables[col].type;
      if (v === '') obj[h] = null;
      else if (t === 'numeric' || t === 'likert') { const n = Number(v); obj[h] = Number.isFinite(n) ? n : null; }
      else obj[h] = v;
    });
    return obj;
  });

  return { name, source, variables, rows };
}

// Convenience: pull one column as a Cell[] in row order.
export function column(ds: Dataset, name: string): Cell[] {
  return ds.rows.map(r => r[name] ?? null);
}

// ---- Cadence-native ingest ---------------------------------------------------
//
// Cadence's "Download my data" JSON (and the study-level aggregate built from
// participants merging their files in the Analytics tab) carries a per-response
// `questions[]` block with `scaleAbbr`, `dim`, `reversed`, and `answer` — far
// richer than a flat CSV. We import that shape natively so:
//   • each scale item becomes one column with metadata (scale, dim, reversed)
//   • reverse-keyed items are silently recoded on the way in (one less landmine)
//   • the recommender immediately knows which items to group for Cronbach's α
//   • waveNum is tagged so the recommender can suggest paired tests
//
// Both shapes are accepted:
//   single participant: { completedWaves, responses: [...] }
//   study aggregate:    [ ... ]  (just the responses array)

interface CadenceQuestion {
  idx: number;
  scaleAbbr?: string;
  text?: string;
  dim?: string | null;
  reversed?: boolean;
  answer?: number;
}
interface CadenceResponse {
  studyId?: string;
  participantCode?: string;
  waveNum?: number;
  completedAt?: string;
  startedAt?: string;
  questions?: CadenceQuestion[];
}

export function isCadenceJson(text: string): boolean {
  try {
    const o = JSON.parse(text);
    const arr = Array.isArray(o) ? o : (o && Array.isArray(o.responses) ? o.responses : null);
    if (!arr || arr.length === 0) return false;
    const first = arr[0];
    return !!(first && Array.isArray(first.questions) && first.questions.length > 0
      && first.questions[0] && typeof first.questions[0].idx === 'number');
  } catch { return false; }
}

export function buildDatasetFromCadence(text: string, name: string): Dataset {
  const parsed = JSON.parse(text);
  const responses: CadenceResponse[] = Array.isArray(parsed) ? parsed : (parsed?.responses ?? []);
  if (responses.length === 0) throw new Error('Cadence file has no responses.');

  // Build the canonical question schema from the union of every response's
  // questions[] (some participants may have skipped optional demographic items).
  // Key on `idx` so the order is preserved; carry the metadata of the first
  // response that defined it.
  const schema = new Map<number, CadenceQuestion>();
  for (const r of responses) {
    for (const q of (r.questions ?? [])) {
      if (!schema.has(q.idx)) schema.set(q.idx, q);
    }
  }
  const qList = [...schema.values()].sort((a, b) => a.idx - b.idx);

  // Detect the Likert ceiling per scale so reverse-recoding uses the right max
  // (Cadence's standard scales run 1–7; demographic items have other shapes).
  const scaleMax = new Map<string, number>();
  for (const r of responses) {
    for (const q of (r.questions ?? [])) {
      if (typeof q.answer !== 'number' || q.answer < 1) continue;
      const key = q.scaleAbbr || 'Custom';
      scaleMax.set(key, Math.max(scaleMax.get(key) ?? 7, q.answer));
    }
  }

  // Column names. Prefer `<ABBR>_<dim>_<n>` when dim is present so reliability
  // suggestions can sub-group by subscale; fall back to `<ABBR>_q<n>`.
  function colName(q: CadenceQuestion): string {
    const abbr = (q.scaleAbbr || 'Q').replace(/[^A-Za-z0-9]+/g, '');
    const dim = q.dim ? '_' + q.dim.replace(/[^A-Za-z0-9]+/g, '') : '';
    return `${abbr}${dim}_q${q.idx + 1}`;
  }
  const colMap = new Map<number, string>();
  qList.forEach(q => colMap.set(q.idx, colName(q)));

  // Assemble rows. Meta columns first, then one column per question.
  const rows: Record<string, Cell>[] = responses.map(r => {
    const obj: Record<string, Cell> = {
      participantCode: r.participantCode ?? null,
      waveNum: typeof r.waveNum === 'number' ? r.waveNum : null,
      completedAt: r.completedAt ?? null,
    };
    const byIdx = new Map<number, CadenceQuestion>();
    for (const q of (r.questions ?? [])) byIdx.set(q.idx, q);
    for (const sq of qList) {
      const col = colMap.get(sq.idx)!;
      const q = byIdx.get(sq.idx);
      const a = q && typeof q.answer === 'number' ? q.answer : null;
      if (a === null || a < 1) { obj[col] = null; continue; }
      if (sq.reversed) {
        const max = scaleMax.get(sq.scaleAbbr || 'Custom') ?? 7;
        obj[col] = (max + 1) - a;
      } else {
        obj[col] = a;
      }
    }
    return obj;
  });

  // ── Auto-compute scale composites ────────────────────────────────────
  // For every (scale, dim) group with ≥2 items we add a column whose value
  // is the participant's mean across the (already reverse-recoded) items.
  // Mirrors the reliability recommender's grouping: prefer subscale-level
  // composites when subdimensions exist, else fall back to scale-level —
  // so UWES gets `UWES_vigor` + `UWES_dedication` (not a meaningless umbrella
  // mean), while a 1-dim scale like PSS gets a single `PSS` composite.
  //
  // Composites land between meta and raw items in the variable list so they
  // surface immediately in Data preview, the recommender, and Visualize.
  interface CompositeSpec { name: string; scaleAbbr: string; dim?: string; itemCols: string[]; max: number }
  const composites: CompositeSpec[] = [];

  // Subscale-level groups (scale + dim).
  const subscaleGroups = new Map<string, { scaleAbbr: string; dim: string; qs: CadenceQuestion[] }>();
  const scaleGroups = new Map<string, CadenceQuestion[]>();
  for (const q of qList) {
    if (!q.scaleAbbr) continue;
    const key = q.scaleAbbr;
    if (!scaleGroups.has(key)) scaleGroups.set(key, []);
    scaleGroups.get(key)!.push(q);
    if (q.dim) {
      const dk = `${key}::${q.dim}`;
      if (!subscaleGroups.has(dk)) subscaleGroups.set(dk, { scaleAbbr: key, dim: q.dim, qs: [] });
      subscaleGroups.get(dk)!.qs.push(q);
    }
  }
  // Prefer subscale composites; mark their parent scale so we don't also emit
  // the (less informative) umbrella mean.
  const subscaledScales = new Set<string>();
  for (const { scaleAbbr, dim, qs } of subscaleGroups.values()) {
    if (qs.length < 2) continue;
    const abbr = scaleAbbr.replace(/[^A-Za-z0-9]+/g, '');
    const cleanDim = dim.replace(/[^A-Za-z0-9]+/g, '');
    composites.push({
      name: `${abbr}_${cleanDim}`,
      scaleAbbr,
      dim,
      itemCols: qs.map(q => colMap.get(q.idx)!),
      max: scaleMax.get(scaleAbbr) ?? 7,
    });
    subscaledScales.add(scaleAbbr);
  }
  for (const [scaleAbbr, qs] of scaleGroups) {
    if (qs.length < 2) continue;
    if (subscaledScales.has(scaleAbbr)) continue;
    const abbr = scaleAbbr.replace(/[^A-Za-z0-9]+/g, '');
    composites.push({
      name: abbr,
      scaleAbbr,
      itemCols: qs.map(q => colMap.get(q.idx)!),
      max: scaleMax.get(scaleAbbr) ?? 7,
    });
  }
  // Guard against accidental name collision with a raw-item column.
  const usedNames = new Set(qList.map(q => colMap.get(q.idx)!));
  for (const c of composites) {
    let n = c.name, suffix = 2;
    while (usedNames.has(n)) n = `${c.name}_c${suffix++}`;
    c.name = n;
    usedNames.add(n);
  }

  // Populate composite values per response. Mean of non-null items; require
  // ≥50% of items present to emit a value (matches common scoring rules and
  // avoids a single-item participant skewing the composite).
  for (const row of rows) {
    for (const c of composites) {
      const vals: number[] = [];
      for (const col of c.itemCols) {
        const v = row[col];
        if (typeof v === 'number') vals.push(v);
      }
      const need = Math.ceil(c.itemCols.length / 2);
      row[c.name] = vals.length >= need ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    }
  }

  // Variable metadata.
  const variables: Variable[] = [
    { name: 'participantCode', type: 'id', missing: rows.filter(r => r.participantCode == null).length },
    { name: 'waveNum', type: 'numeric', missing: rows.filter(r => r.waveNum == null).length, cadenceWaveCol: true },
    { name: 'completedAt', type: 'text', missing: rows.filter(r => r.completedAt == null).length },
    ...composites.map<Variable>(c => ({
      name: c.name,
      type: 'numeric',
      likertMin: 1,
      likertMax: c.max,
      missing: rows.filter(r => r[c.name] == null).length,
      cadenceScaleAbbr: c.scaleAbbr,
      cadenceDim: c.dim,
      cadenceComposite: true,
      cadenceCompositeItems: c.itemCols,
    })),
    ...qList.map<Variable>(q => {
      const col = colMap.get(q.idx)!;
      const values = rows.map(r => r[col]).filter(v => typeof v === 'number') as number[];
      const min = values.length ? Math.min(...values) : 1;
      const max = Math.max(scaleMax.get(q.scaleAbbr || 'Custom') ?? 7, values.length ? Math.max(...values) : 7);
      return {
        name: col,
        type: 'likert',
        likertMin: min,
        likertMax: max,
        missing: rows.filter(r => r[col] == null).length,
        cadenceScaleAbbr: q.scaleAbbr || 'Custom',
        cadenceDim: q.dim || undefined,
        cadenceReversed: !!q.reversed,
      };
    }),
  ];

  const studyId = responses[0]?.studyId;
  return { name, source: 'cadence', variables, rows, cadenceStudyId: studyId };
}
