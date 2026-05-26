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
