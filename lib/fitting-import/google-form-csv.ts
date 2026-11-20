import { parseCsv } from "@/lib/csv";
import { normalizePhone } from "@/lib/appointments/phone";

type ColumnSpec = {
  readonly headers: readonly string[];
  readonly loose?: RegExp;
};

export const FORM_COLUMNS = {
  timestamp: { headers: ["Timestamp"] },
  name: { headers: ["Name", "Full name", "Customer name"] },
  mobile: { headers: ["Mobile No", "Mobile", "Mobile number", "Phone", "Phone number", "Contact number"], loose: /\bmobile\b/ },
  email: { headers: ["Email", "Email address", "Email Address"] },
  shoulderLength: { headers: ["A) Shoulder length Measurements (Inches)"], loose: /shoulder/ },
  neckToBack: { headers: ["B) Neck to Back Measurements (Inches)"], loose: /neck to back/ },
  headToBack: { headers: ["C) Head to Back Measurements (Inches)"], loose: /head to back/ },
  neckLength: { headers: ["D) Neck length Measurements (Inches)"], loose: /neck length/ },
  recommendedSize: { headers: ["Recommended Pillow size", "Recommended size"], loose: /recommended.*size/ },
  configurationType: { headers: ["Configuration Type"], loose: /configuration type/ },
  profileSide: { headers: ["Profile Side", "Profile Type"], loose: /^profile (side|type)/ },
  backPhoto: { headers: ["Upload a photo of your back"], loose: /photo of your back/ },
  sidePhoto: { headers: ["Upload a photo of your side"], loose: /photo of your side/ },
  backSleepPreview: { headers: ["Back Sleep preview (for official use)"], loose: /back sleep preview/ },
  sideSleepPreview: { headers: ["Side Sleep preview (for official use)"], loose: /side sleep preview/ },
  customisationForm: { headers: ["Customization form (for official use)", "Customisation form (for official use)"], loose: /customi[sz]ation form/ },
  discoverySource: { headers: ["How did you know about Mpillow?", "How did you hear about Mpillow?"], loose: /know about mpillow|hear about/ },
  bloodPressure: { headers: ["Blood Pressure Level", "Blood pressure"], loose: /blood pressure/ },
  ageGroup: { headers: ["Age group", "Age"] },
  gender: { headers: ["Gender"] },
  servicedBy: { headers: ["Serviced by", "Served by", "Staff"], loose: /servic|served by/ },
  notes: { headers: ["Additional Notes", "Notes", "Remarks"], loose: /additional notes/ },
  earDiscomfort: { headers: ["Ear discomfort during side sleep?"], loose: /ear discomfort/ },
  bedFirmness: { headers: ["What is the firmness of your bed?", "Bed firmness"], loose: /firmness/ },
  acidReflux: { headers: ["Did you have acid reflux?", "Acid reflux"], loose: /acid reflux/ },
  referredBy: { headers: ["Who were you referred from?", "Referred by"], loose: /referred/ },
  symptoms: { headers: ["During/ after I sleep, I have:"], loose: /after i sleep/ },
  sleeperType: { headers: ["I'm a:", "I am a:", "Sleeper type", "Sleep position"], loose: /^i'?m a$|^i am a$/ },
  usesBolster: { headers: ["Do you use bolsters to sleep?", "Do you use a bolster?"], loose: /bolster/ },
} as const satisfies Record<string, ColumnSpec>;

export type FormField = keyof typeof FORM_COLUMNS;
export const FORM_FIELDS = Object.keys(FORM_COLUMNS) as FormField[];

export const DRIVE_FIELDS = ["backPhoto", "sidePhoto", "backSleepPreview", "sideSleepPreview", "customisationForm"] as const;
export type DriveField = (typeof DRIVE_FIELDS)[number];

export const DRIVE_SLOTS = {
  backPhoto: "back_photo",
  sidePhoto: "side_photo",
  backSleepPreview: "back_sleep_preview",
  sideSleepPreview: "side_sleep_preview",
  customisationForm: "customisation_form",
} as const satisfies Record<DriveField, string>;
export type DriveSlot = (typeof DRIVE_SLOTS)[DriveField];

export type FormRawRow = { cells: Partial<Record<FormField, string>>; other: Record<string, string>; fileRow?: number };

export type FormHeaderCheck = {
  ok: boolean;
  problems: string[];
  missing: string[];
  other: string[];
};

export type ParsedFittingForm = { header: FormHeaderCheck; rows: FormRawRow[] };

export function cleanCell(value: string | null | undefined): string {
  return (value ?? "").replace(/^﻿/, "").trim().replace(/^'/, "").trim();
}

export function headerKey(header: string): string {
  return cleanCell(header)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[\s:]+$/, "")
    .trim();
}

export function parseFittingFormCsv(text: string): ParsedFittingForm {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map(cleanCell);
  const keys = header.map(headerKey);

  const index = new Map<FormField, number>();
  const used = new Set<number>();
  for (const field of FORM_FIELDS) {
    const wanted = new Set(FORM_COLUMNS[field].headers.map(headerKey));
    const at = keys.findIndex((k, i) => !used.has(i) && wanted.has(k));
    if (at >= 0) {
      index.set(field, at);
      used.add(at);
    }
  }
  for (const field of FORM_FIELDS) {
    if (index.has(field)) continue;
    const spec: ColumnSpec = FORM_COLUMNS[field];
    if (!spec.loose) continue;
    const at = keys.findIndex((k, i) => !used.has(i) && k !== "" && spec.loose!.test(k));
    if (at >= 0) {
      index.set(field, at);
      used.add(at);
    }
  }

  const otherNames = new Map<number, string>();
  const seen = new Map<string, number>();
  header.forEach((h, i) => {
    if (used.has(i)) return;
    const base = h.replace(/[\s:]+$/, "") || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    otherNames.set(i, n > 1 ? `${base} (${n})` : base);
  });

  const problems: string[] = [];
  if (!index.has("timestamp")) problems.push("The file has no Timestamp column.");
  if (!index.has("email") && !index.has("mobile")) problems.push("The file has neither an Email nor a Mobile column.");
  if (table.length < 2) problems.push("The file has no rows.");

  const rows: FormRawRow[] = table.slice(1).map((cells, fileRow) => {
    const raw: FormRawRow = { cells: {}, other: {}, fileRow };
    for (const [field, at] of index) {
      const cell = cleanCell(cells[at]);
      if (cell !== "") raw.cells[field] = cell;
    }
    for (const [at, name] of otherNames) {
      const cell = cleanCell(cells[at]);
      if (cell !== "") raw.other[name] = cell;
    }
    return raw;
  });

  return {
    header: {
      ok: problems.length === 0,
      problems,
      missing: FORM_FIELDS.filter((f) => !index.has(f) && f !== "timestamp").map((f) => FORM_COLUMNS[f].headers[0]),
      other: [...otherNames.values()],
    },
    rows: importOrder(rows),
  };
}

export function importOrder(rows: readonly FormRawRow[]): FormRawRow[] {
  const withEmail = rows.filter((r) => usableEmail(r.cells.email) !== null);
  return [...withEmail, ...rows.filter((r) => usableEmail(r.cells.email) === null)];
}

export type DateOrder = "mdy" | "dmy";

export const FORM_UTC_OFFSET = "+08:00";
export const EARLIEST_FITTING = "2015-01-01T00:00:00Z";

const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?)?$/i;
const YEAR_FIRST =
  /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?)?\s*(?:(?:GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?|Z)?$/i;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function toIso(
  y: number,
  mo: number,
  d: number,
  hRaw: string | undefined,
  mi: string | undefined,
  s: string | undefined,
  ampm: string | undefined,
  offset: string,
): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
  let h = hRaw === undefined ? 0 : Number(hRaw);
  const min = mi === undefined ? 0 : Number(mi);
  const sec = s === undefined ? 0 : Number(s);
  if (ampm) {
    if (h < 1 || h > 12) return null;
    const pm = ampm.toLowerCase().startsWith("p");
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  const at = new Date(`${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sec)}${offset}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function slashedParts(cell: string): [number, number] | null {
  const m = SLASHED.exec(cleanCell(cell));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function parseFormTimestamp(cell: string | undefined, order: DateOrder): string | null {
  const s = cleanCell(cell);
  if (!s) return null;
  const slashed = SLASHED.exec(s);
  if (slashed) {
    const [, a, b, y, h, mi, sec, ampm] = slashed;
    const [mo, d] = order === "mdy" ? [Number(a), Number(b)] : [Number(b), Number(a)];
    return toIso(Number(y), mo, d, h, mi, sec, ampm, FORM_UTC_OFFSET);
  }
  const yearFirst = YEAR_FIRST.exec(s);
  if (yearFirst) {
    const [, y, mo, d, h, mi, sec, ampm, offH, offM] = yearFirst;
    let offset = FORM_UTC_OFFSET;
    if (/z$/i.test(s)) offset = "Z";
    else if (offH !== undefined) {
      const sign = offH.startsWith("-") ? "-" : "+";
      offset = `${sign}${pad(Math.abs(Number(offH)))}:${pad(Number(offM ?? 0))}`;
    }
    return toIso(Number(y), Number(mo), Number(d), h, mi, sec, ampm, offset);
  }
  return null;
}

export type DateOrderReading = {
  proven: DateOrder | null;
  conflict: boolean;
};

export function readDateOrder(rows: readonly FormRawRow[]): DateOrderReading {
  let mdy = false;
  let dmy = false;
  for (const r of rows) {
    const parts = slashedParts(r.cells.timestamp ?? "");
    if (!parts) continue;
    if (parts[0] > 12) dmy = true;
    if (parts[1] > 12) mdy = true;
  }
  if (mdy && dmy) return { proven: null, conflict: true };
  return { proven: mdy ? "mdy" : dmy ? "dmy" : null, conflict: false };
}

export type RowInvalidReason = "no_timestamp" | "no_contact";

export type RowRepair =
  | "email_invalid"
  | "mobile_unusable"
  | "measurement_unreadable"
  | "answer_unreadable"
  | "drive_link_unreadable"
  | "text_shortened";

export type DriveFileRef = { slot: DriveSlot; file_id: string };

export type FittingColumns = {
  fitted_at: string;
  name_on_form: string | null;
  email_on_form: string | null;
  mobile_on_form: string | null;
  shoulder_length_in: number | null;
  neck_to_back_in: number | null;
  head_to_back_in: number | null;
  neck_length_in: number | null;
  recommended_size: string | null;
  configuration_type: string | null;
  profile_side: string | null;
  sleeper_type: string | null;
  sleep_symptoms: string[];
  blood_pressure: string | null;
  acid_reflux: boolean | null;
  ear_discomfort_side_sleep: boolean | null;
  bed_firmness: string | null;
  uses_bolster: boolean | null;
  age_group: string | null;
  gender: string | null;
  discovery_source: string | null;
  referred_by: string | null;
  serviced_by: string | null;
  notes: string | null;
  drive_files: DriveFileRef[];
  other_answers: Record<string, string>;
};

export type NormalisedFitting = {
  key: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  fitting: FittingColumns;
};

export type NormaliseResult =
  | { ok: true; row: NormalisedFitting; repairs: RowRepair[] }
  | { ok: false; reason: RowInvalidReason };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usableEmail(cell: string | undefined): string | null {
  const e = cell?.toLowerCase() ?? "";
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function nameKey(name: string | null | undefined): string | null {
  const k = (name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return k || null;
}
const LIMITS = { name: 200, short: 40, code: 80, text: 200, notes: 5000 } as const;
const MAX_MEASUREMENT_IN = 99;
const MAX_SYMPTOMS = 30;
const MAX_DRIVE_FILES = 50;

const label = (field: FormField) => FORM_COLUMNS[field].headers[0];

export function parseInches(cell: string): number | null {
  const s = cell
    .toLowerCase()
    .replace(/(inches|inch|in\.?|["”″])\s*$/, "")
    .trim();
  let n: number | null = null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (/^\d+(\.\d+)?$|^\.\d+$/.test(s)) n = Number(s);
  else if (mixed && Number(mixed[3]) > 0) n = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  else if (frac && Number(frac[2]) > 0) n = Number(frac[1]) / Number(frac[2]);
  if (n === null || !Number.isFinite(n) || n < 0 || n > MAX_MEASUREMENT_IN) return null;
  return Math.round(n * 100) / 100;
}

export function parseYesNo(cell: string): boolean | null {
  const s = cell.trim().toLowerCase();
  if (["yes", "y", "true"].includes(s)) return true;
  if (["no", "n", "false"].includes(s)) return false;
  return null;
}

export function driveFileIds(cell: string): string[] {
  const ids: string[] = [];
  for (const m of cell.matchAll(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]{10,})/g)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

export function splitAnswers(cell: string): string[] {
  const out: string[] = [];
  for (const part of cell.split(/,\s+|\n/)) {
    const t = part.trim().replace(/,$/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function normaliseFittingRow(raw: FormRawRow, order: DateOrder, now = Date.now()): NormaliseResult {
  const c = raw.cells;
  const fittedAt = parseFormTimestamp(c.timestamp, order);
  if (!fittedAt || fittedAt < EARLIEST_FITTING || Date.parse(fittedAt) > now + 86_400_000) {
    return { ok: false, reason: "no_timestamp" };
  }

  const repairs = new Set<RowRepair>();
  const other: Record<string, string> = { ...raw.other };
  const keep = (field: FormField, repair: RowRepair) => {
    other[label(field)] = c[field]!;
    repairs.add(repair);
  };

  const text = (field: FormField, max: number): string | null => {
    const v = c[field];
    if (!v) return null;
    if (v.length <= max) return v;
    keep(field, "text_shortened");
    return v.slice(0, max);
  };

  const email = usableEmail(c.email);
  if (c.email && !email) repairs.add("email_invalid");
  const phone = c.mobile ? normalizePhone(c.mobile) : null;
  if (c.mobile && !phone) repairs.add("mobile_unusable");
  if (!email && !phone) return { ok: false, reason: "no_contact" };

  const inches = (field: FormField): number | null => {
    const v = c[field];
    if (!v) return null;
    const n = parseInches(v);
    if (n === null) keep(field, "measurement_unreadable");
    return n;
  };
  const yesNo = (field: FormField): boolean | null => {
    const v = c[field];
    if (!v) return null;
    const b = parseYesNo(v);
    if (b === null) keep(field, "answer_unreadable");
    return b;
  };

  const drive_files: DriveFileRef[] = [];
  for (const field of DRIVE_FIELDS) {
    const v = c[field];
    if (!v) continue;
    const ids = driveFileIds(v);
    if (ids.length === 0) keep(field, "drive_link_unreadable");
    for (const file_id of ids) {
      if (drive_files.length < MAX_DRIVE_FILES) drive_files.push({ slot: DRIVE_SLOTS[field], file_id });
    }
  }

  let symptoms = c.symptoms ? splitAnswers(c.symptoms) : [];
  if (symptoms.length > MAX_SYMPTOMS || symptoms.some((s) => s.length > LIMITS.text)) {
    keep("symptoms", "text_shortened");
    symptoms = symptoms.slice(0, MAX_SYMPTOMS).map((s) => s.slice(0, LIMITS.text));
  }

  const name = text("name", LIMITS.name)?.replace(/\s+/g, " ") ?? null;

  return {
    ok: true,
    row: {
      key: `google_form|${fittedAt}|${email ?? phone}`,
      email,
      phone,
      name,
      fitting: {
        fitted_at: fittedAt,
        name_on_form: name,
        email_on_form: c.email ? c.email.slice(0, 254) : null,
        mobile_on_form: c.mobile ? c.mobile.slice(0, LIMITS.short) : null,
        shoulder_length_in: inches("shoulderLength"),
        neck_to_back_in: inches("neckToBack"),
        head_to_back_in: inches("headToBack"),
        neck_length_in: inches("neckLength"),
        recommended_size: text("recommendedSize", LIMITS.short),
        configuration_type: text("configurationType", LIMITS.code),
        profile_side: text("profileSide", LIMITS.code),
        sleeper_type: text("sleeperType", LIMITS.text),
        sleep_symptoms: symptoms,
        blood_pressure: text("bloodPressure", LIMITS.code),
        acid_reflux: yesNo("acidReflux"),
        ear_discomfort_side_sleep: yesNo("earDiscomfort"),
        bed_firmness: text("bedFirmness", LIMITS.code),
        uses_bolster: yesNo("usesBolster"),
        age_group: text("ageGroup", LIMITS.short),
        gender: text("gender", LIMITS.short),
        discovery_source: text("discoverySource", LIMITS.text),
        referred_by: text("referredBy", LIMITS.text),
        serviced_by: text("servicedBy", LIMITS.text),
        notes: text("notes", LIMITS.notes),
        drive_files,
        other_answers: other,
      },
    },
    repairs: [...repairs],
  };
}
