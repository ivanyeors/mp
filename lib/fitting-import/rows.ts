/**
 * The rows a Fitting import sends, as the server reads them back (ADR 0039 e).
 *
 * Pure. The browser holds the file; a server action receives a chunk of rows
 * and trusts nothing in it: `readRawRow` keeps only known fields and string
 * cells within the columns' limits, so anything else the request carries is
 * dropped on arrival.
 */
import { FORM_FIELDS, type FormField, type FormRawRow } from "./google-form-csv";

const FIELD_SET: ReadonlySet<string> = new Set(FORM_FIELDS);
/** A cell longer than this is not a form answer. Notes, the longest column, are capped at 5,000. */
const MAX_CELL = 20_000;
const MAX_OTHER_COLUMNS = 100;
const MAX_HEADER = 300;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** One raw row from a request, or null when it is not one. */
export function readRawRow(input: unknown, fields: readonly FormField[] = FORM_FIELDS, withOther = true): FormRawRow | null {
  if (!isRecord(input) || !isRecord(input.cells)) return null;
  const wanted = new Set<string>(fields);
  const cells: FormRawRow["cells"] = {};
  for (const [k, v] of Object.entries(input.cells)) {
    if (!FIELD_SET.has(k) || !wanted.has(k)) continue;
    if (typeof v === "string" && v !== "" && v.length <= MAX_CELL) cells[k as FormField] = v;
  }
  const other: Record<string, string> = {};
  if (withOther && isRecord(input.other)) {
    for (const [k, v] of Object.entries(input.other).slice(0, MAX_OTHER_COLUMNS)) {
      if (k && k.length <= MAX_HEADER && typeof v === "string" && v !== "" && v.length <= MAX_CELL) other[k] = v;
    }
  }
  return { cells, other };
}

/** Only `fields`' cells, and no other answers: what the preview sends. */
export function pickCells(raw: FormRawRow, fields: readonly FormField[]): FormRawRow {
  const cells: FormRawRow["cells"] = {};
  for (const f of fields) {
    const v = raw.cells[f];
    if (v) cells[f] = v;
  }
  return { cells, other: {} };
}
