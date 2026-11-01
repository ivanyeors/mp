/**
 * What a Fitting import would do with each row of the Google Form export
 * (ADR 0039 c, d).
 *
 * Pure: the Admin Panel preview runs it on the server against live rows, and
 * vitest runs it against fixtures. The preview is a forecast;
 * `import_fitting_rows` (20261031120000_customer_fittings.sql) re-decides
 * every row when it writes, and is the authority.
 *
 * One person's fittings all go to one Customer, however many there are
 * (ADR 0039 c). Plan rules, in order, as the SQL function has them:
 *  1. `already_imported`: a Fitting record already has this row's key.
 *  2. A usable email: `matched_email` when a Customer holds it. Otherwise
 *     the same person under another email: `matched_phone` when exactly one
 *     Customer has the row's mobile and the same name. Otherwise `created`
 *     (a Customer with no login).
 *  3. No usable email, a usable mobile: `matched_phone` when exactly one
 *     Customer has that number, or when several do and exactly one of them
 *     has the same name; otherwise skipped, as `no_customer_for_mobile` or
 *     `mobile_matches_several`.
 *
 * Rows run in `importOrder`, every row with an email first, so a visit noted
 * with only a mobile finds the Customer another visit's email creates.
 *
 * A row with no readable timestamp, no usable email or mobile, or the same key
 * as another row in the file is skipped before the rules.
 */
import {
  nameKey,
  normaliseFittingRow,
  type DateOrder,
  type FormRawRow,
  type NormaliseResult,
  type RowInvalidReason,
} from "./google-form-csv";

export type SkipReason = RowInvalidReason | "duplicate_in_file" | "no_customer_for_mobile" | "mobile_matches_several";

export type PlanOutcome = "created" | "matched_email" | "matched_phone" | "already_imported" | "skip";
export const PLAN_OUTCOMES: readonly PlanOutcome[] = ["created", "matched_email", "matched_phone", "already_imported", "skip"];

/** A Customer with a mobile, and their name as `nameKey` compares it. */
export type PhoneHolder = { id: string; nameKey: string | null };

export type ExistingLookup = {
  /** Customer ids by lowercased email. */
  customersByEmail: ReadonlyMap<string, string>;
  /** Customers by E.164 mobile; several when several Customers share it. */
  customersByPhone: ReadonlyMap<string, readonly PhoneHolder[]>;
  /** Row keys a Fitting record already has. */
  importedKeys: ReadonlySet<string>;
};

export const NO_EXISTING: ExistingLookup = {
  customersByEmail: new Map(),
  customersByPhone: new Map(),
  importedKeys: new Set(),
};

export type RowPlan =
  | { outcome: "created" | "already_imported" }
  | { outcome: "matched_email" | "matched_phone"; customer_id: string }
  | { outcome: "skip"; reason: SkipReason };

/** The holders of a mobile with this name. */
export function sameName(holders: readonly PhoneHolder[], name: string | null): PhoneHolder[] {
  const k = nameKey(name);
  return k ? holders.filter((h) => h.nameKey === k) : [];
}

export function planFittingRow(
  row: { key: string; email: string | null; phone: string | null; name: string | null },
  existing: ExistingLookup,
): RowPlan {
  if (existing.importedKeys.has(row.key)) return { outcome: "already_imported" };
  const holders = row.phone ? existing.customersByPhone.get(row.phone) ?? [] : [];
  const named = sameName(holders, row.name);
  if (row.email) {
    const id = existing.customersByEmail.get(row.email);
    if (id) return { outcome: "matched_email", customer_id: id };
    // The same person, another email: their mobile and their name.
    if (named.length === 1) return { outcome: "matched_phone", customer_id: named[0]!.id };
    return { outcome: "created" };
  }
  if (holders.length === 1) return { outcome: "matched_phone", customer_id: holders[0]!.id };
  if (named.length === 1) return { outcome: "matched_phone", customer_id: named[0]!.id };
  return { outcome: "skip", reason: holders.length === 0 ? "no_customer_for_mobile" : "mobile_matches_several" };
}

// ─── Rows in bulk ────────────────────────────────────────────────────────────

/** A raw row and its position in the file (0-based, header excluded). */
export type IndexedRawRow = { i: number; raw: FormRawRow };
export type IndexedNormalised = { i: number; result: NormaliseResult };

export function normaliseRows(rows: readonly IndexedRawRow[], order: DateOrder, now?: number): IndexedNormalised[] {
  return rows.map(({ i, raw }) => ({ i, result: normaliseFittingRow(raw, order, now) }));
}

/** Rows whose key another row also has: every copy after the first. */
export function duplicateSkips(rows: readonly IndexedNormalised[]): Set<number> {
  const seen = new Set<string>();
  const out = new Set<number>();
  for (const { i, result } of rows) {
    if (!result.ok) continue;
    if (seen.has(result.row.key)) out.add(i);
    else seen.add(result.row.key);
  }
  return out;
}

/** The emails, mobiles and keys to look up for these rows. */
export function lookupKeys(rows: readonly IndexedNormalised[]): { emails: string[]; phones: string[]; keys: string[] } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const keys = new Set<string>();
  for (const { result } of rows) {
    if (!result.ok) continue;
    keys.add(result.row.key);
    if (result.row.email) emails.add(result.row.email);
    // Every row's: one with an email may be the same person under another one.
    if (result.row.phone) phones.add(result.row.phone);
  }
  return { emails: [...emails], phones: [...phones], keys: [...keys] };
}

/** One row's preview. It carries no PII: the browser already holds the row, and looks it up by `i`. */
export type RowPreview = { i: number; outcome: PlanOutcome; reason?: SkipReason };

/**
 * Plan every row. Duplicates are found among `rows` only: run it on the whole
 * file for the whole file's answer, and on a chunk for that chunk's.
 */
export function planRows(rows: readonly IndexedNormalised[], existing: ExistingLookup): RowPreview[] {
  const dupes = duplicateSkips(rows);
  return rows.map(({ i, result }): RowPreview => {
    if (!result.ok) return { i, outcome: "skip", reason: result.reason };
    if (dupes.has(i)) return { i, outcome: "skip", reason: "duplicate_in_file" };
    const plan = planFittingRow(result.row, existing);
    return plan.outcome === "skip" ? { i, outcome: "skip", reason: plan.reason } : { i, outcome: plan.outcome };
  });
}

/**
 * The whole file's forecast from the chunks' answers. A chunk cannot see the
 * rows before it, so the file settles what the Customers created by earlier
 * rows change, as the SQL function will find them: a key seen earlier is a
 * duplicate; an email an earlier row creates is a match; and the mobile and
 * name of a Customer an earlier row creates find that person again, for a
 * row under another email or with none. `previews` run in import order.
 */
export function settleWholeFile(rows: readonly IndexedNormalised[], previews: readonly RowPreview[]): RowPreview[] {
  const dupes = duplicateSkips(rows);
  const byIndex = new Map(rows.map((r) => [r.i, r.result]));
  const createdEmails = new Set<string>();
  const createdByPhone = new Map<string, PhoneHolder[]>();
  return previews.map((p): RowPreview => {
    if (dupes.has(p.i)) return { i: p.i, outcome: "skip", reason: "duplicate_in_file" };
    const result = byIndex.get(p.i);
    if (!result?.ok) return p;
    const { email, phone, name } = result.row;
    const created = phone ? createdByPhone.get(phone) ?? [] : [];
    if (p.outcome === "created" && email) {
      if (createdEmails.has(email)) return { i: p.i, outcome: "matched_email" };
      if (sameName(created, name).length === 1) return { i: p.i, outcome: "matched_phone" };
      createdEmails.add(email);
      if (phone) createdByPhone.set(phone, [...created, { id: email, nameKey: nameKey(name) }]);
      return p;
    }
    if (p.outcome === "skip" && p.reason === "no_customer_for_mobile" && created.length > 0) {
      if (created.length === 1 || sameName(created, name).length === 1) return { i: p.i, outcome: "matched_phone" };
      return { i: p.i, outcome: "skip", reason: "mobile_matches_several" };
    }
    return p;
  });
}

// ─── Reading what the database holds ─────────────────────────────────────────

/** One row of `fitting_import_preview_matches`. */
export type PreviewMatchRow = {
  match: "email" | "phone" | "key";
  key: string;
  customer_id: string;
  /** A 'phone' row's Customer name, as `public.fitting_name_key` reads it. */
  name_key?: string | null;
};

export function existingFromMatches(rows: readonly PreviewMatchRow[]): ExistingLookup {
  const customersByEmail = new Map<string, string>();
  const customersByPhone = new Map<string, PhoneHolder[]>();
  const importedKeys = new Set<string>();
  for (const r of rows) {
    if (r.match === "email") customersByEmail.set(r.key, r.customer_id);
    else if (r.match === "phone") {
      const holders = customersByPhone.get(r.key) ?? [];
      if (!holders.some((h) => h.id === r.customer_id)) holders.push({ id: r.customer_id, nameKey: r.name_key ?? null });
      customersByPhone.set(r.key, holders);
    } else importedKeys.add(r.key);
  }
  return { customersByEmail, customersByPhone, importedKeys };
}
