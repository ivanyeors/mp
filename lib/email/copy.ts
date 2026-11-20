export interface CopyField {
  label: string;
  default: string;
  hint?: string;
  multiline?: boolean;
  optional?: boolean;
  max?: number;
  group?: string;
}

export interface EmailCopySpec<K extends string = string> {
  id: string;
  name: string;
  description: string;
  fields: Record<K, CopyField>;
  placeholders: Record<string, string>;
}

export type EmailCopy<K extends string = string> = Record<K, string>;

export const SINGLE_LINE_MAX = 300;
export const MULTILINE_MAX = 3000;

export function defineEmailCopy<K extends string>(spec: EmailCopySpec<K>): EmailCopySpec<K> {
  return spec;
}

const fieldKeys = <K extends string>(spec: EmailCopySpec<K>) => Object.keys(spec.fields) as K[];

export function defaultEmailCopy<K extends string>(spec: EmailCopySpec<K>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of fieldKeys(spec)) out[k] = spec.fields[k].default;
  return out;
}

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;

const PROPER_WORDS: Record<string, string> = { whatsapp: "WhatsApp" };

export function placeholderLabel(key: string): string {
  const label = key
    .split("_")
    .filter(Boolean)
    .map((w) => PROPER_WORDS[w] ?? w)
    .join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

export function fillCopy(text: string, values: Record<string, string | number | null | undefined>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    if (!(name in values)) return whole;
    const v = values[name];
    return v == null ? "" : String(v);
  });
}

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
      errors[k] = `${unknown.map((p) => `{${p}}`).join(", ")} ${unknown.length === 1 ? "is not a variable" : "are not variables"} this email has.`;
    } else values[k] = text;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

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

export function editedFields<K extends string>(spec: EmailCopySpec<K>, copy: EmailCopy<K>): K[] {
  return fieldKeys(spec).filter((k) => copy[k] !== spec.fields[k].default);
}
