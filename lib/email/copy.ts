// ============================================================
// Editable email copy: the words of each email, in one place
// ============================================================
//
// PRD-email-templates. Every email the platform sends keeps its layout, its
// data blocks (order tables, amounts, addresses, codes) and its footer in
// code. Its WORDS (subject, inbox preview line, heading, paragraphs, button
// label) are an `EmailCopySpec`: named fields with a default each, which
// Staff can override on Admin Panel → Email templates.
//
// A field may name the email's placeholders, e.g. "Order {order_number}
// confirmed". The renderer fills them from its own data, so a placeholder's
// value is escaped by the components like any other text: nothing Staff type
// becomes markup.
//
// Renderers stay pure. Each takes its copy as its last argument, defaulting
// to the spec's defaults, so a test or preview renders exactly as before. The
// send paths load the saved copy first (`loadEmailCopy`, ./copy-store.ts),
// which falls back to the defaults on any failure: an edit can never stop an
// order email from going.

/** One editable piece of wording in an email. */
export interface CopyField {
  /** What Staff see above the box, e.g. "Opening paragraph". */
  label: string;
  /** The wording the email had before any edit, with its placeholders. */
  default: string;
  /** A line under the box: when this text shows, or what it must say. */
  hint?: string;
  /** Several paragraphs: a blank line starts a new one. */
  multiline?: boolean;
  /** May be left empty: the email then leaves it out. */
  optional?: boolean;
  /** The most characters it takes. */
  max?: number;
  /**
   * The variant of the email this field belongs to, when one renderer has
   * several voices (a card hold or none, a balance or not). Fields of the same
   * group are shown together.
   */
  group?: string;
}

/** The editable words of one email. */
export interface EmailCopySpec<K extends string = string> {
  /** Stable id, stored with the edit: never rename one that has edits. */
  id: string;
  /** How Staff name it, e.g. "Order confirmed". */
  name: string;
  /** When it is sent, in one sentence. */
  description: string;
  fields: Record<K, CopyField>;
  /** The placeholders its fields may use, with what each becomes. */
  placeholders: Record<string, string>;
}

export type EmailCopy<K extends string = string> = Record<K, string>;

export const SINGLE_LINE_MAX = 300;
export const MULTILINE_MAX = 3000;

export function defineEmailCopy<K extends string>(spec: EmailCopySpec<K>): EmailCopySpec<K> {
  return spec;
}

const fieldKeys = <K extends string>(spec: EmailCopySpec<K>) => Object.keys(spec.fields) as K[];

/** Pure — the spec's own wording. */
export function defaultEmailCopy<K extends string>(spec: EmailCopySpec<K>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of fieldKeys(spec)) out[k] = spec.fields[k].default;
  return out;
}

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;

/** Pure — the placeholders a text names, in order, once each. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/**
 * Pure — `text` with each `{name}` replaced by its value. A placeholder with
 * no value (null, undefined) becomes empty; one the caller did not pass is
 * left as written, which validation keeps from ever being saved.
 */
export function fillCopy(text: string, values: Record<string, string | number | null | undefined>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    if (!(name in values)) return whole;
    const v = values[name];
    return v == null ? "" : String(v);
  });
}

/** Pure — a multiline field's paragraphs: blank lines part them; single line ends are kept as spaces. */
export function copyParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export type CopyValidation<K extends string> =
  | { ok: true; values: EmailCopy<K> }
  | { ok: false; errors: Partial<Record<K, string>> };

/**
 * Pure — Staff's edit, checked field by field: every field present and a
 * string; trimmed; not empty unless optional; within its length; and naming
 * only this email's placeholders.
 */
export function validateEmailCopy<K extends string>(spec: EmailCopySpec<K>, input: unknown): CopyValidation<K> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const values = {} as EmailCopy<K>;
  const errors: Partial<Record<K, string>> = {};
  for (const k of fieldKeys(spec)) {
    const field = spec.fields[k];
    const v = raw[k];
    if (typeof v !== "string") {
      errors[k] = "Missing.";
      continue;
    }
    const text = field.multiline ? v.replace(/\r\n?/g, "\n").trim() : v.replace(/\s+/g, " ").trim();
    const max = field.max ?? (field.multiline ? MULTILINE_MAX : SINGLE_LINE_MAX);
    const unknown = placeholdersIn(text).filter((p) => !(p in spec.placeholders));
    if (!text && !field.optional) errors[k] = "This can't be empty.";
    else if (text.length > max) errors[k] = `At most ${max} characters.`;
    else if (unknown.length) {
      errors[k] = `${unknown.map((p) => `{${p}}`).join(", ")} ${unknown.length === 1 ? "is not a placeholder" : "are not placeholders"} this email has.`;
    } else values[k] = text;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/**
 * Pure — the copy an email sends with: each saved field that still passes
 * validation, else its default. A field added since the edit takes its
 * default; a field removed since is ignored; a saved value that no longer
 * passes (a placeholder the email dropped) falls back alone.
 */
export function resolveEmailCopy<K extends string>(spec: EmailCopySpec<K>, saved: unknown): EmailCopy<K> {
  const out = defaultEmailCopy(spec);
  if (!saved || typeof saved !== "object") return out;
  for (const k of fieldKeys(spec)) {
    const one = validateEmailCopy({ ...spec, fields: { [k]: spec.fields[k] } as Record<K, CopyField> }, {
      [k]: (saved as Record<string, unknown>)[k],
    });
    if (one.ok) out[k] = one.values[k];
  }
  return out;
}

/** Pure — the fields whose saved wording differs from the default. */
export function editedFields<K extends string>(spec: EmailCopySpec<K>, copy: EmailCopy<K>): K[] {
  return fieldKeys(spec).filter((k) => copy[k] !== spec.fields[k].default);
}
