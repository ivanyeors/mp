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

export type PhoneHolder = { id: string; nameKey: string | null };

export type ExistingLookup = {
  customersByEmail: ReadonlyMap<string, string>;
  customersByPhone: ReadonlyMap<string, readonly PhoneHolder[]>;
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
    if (named.length === 1) return { outcome: "matched_phone", customer_id: named[0]!.id };
    return { outcome: "created" };
  }
  if (holders.length === 1) return { outcome: "matched_phone", customer_id: holders[0]!.id };
  if (named.length === 1) return { outcome: "matched_phone", customer_id: named[0]!.id };
  return { outcome: "skip", reason: holders.length === 0 ? "no_customer_for_mobile" : "mobile_matches_several" };
}

export type IndexedRawRow = { i: number; raw: FormRawRow };
export type IndexedNormalised = { i: number; result: NormaliseResult };

export function normaliseRows(rows: readonly IndexedRawRow[], order: DateOrder, now?: number): IndexedNormalised[] {
  return rows.map(({ i, raw }) => ({ i, result: normaliseFittingRow(raw, order, now) }));
}

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

export function lookupKeys(rows: readonly IndexedNormalised[]): { emails: string[]; phones: string[]; keys: string[] } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const keys = new Set<string>();
  for (const { result } of rows) {
    if (!result.ok) continue;
    keys.add(result.row.key);
    if (result.row.email) emails.add(result.row.email);
    if (result.row.phone) phones.add(result.row.phone);
  }
  return { emails: [...emails], phones: [...phones], keys: [...keys] };
}

export type RowPreview = { i: number; outcome: PlanOutcome; reason?: SkipReason };

export function planRows(rows: readonly IndexedNormalised[], existing: ExistingLookup): RowPreview[] {
  const dupes = duplicateSkips(rows);
  return rows.map(({ i, result }): RowPreview => {
    if (!result.ok) return { i, outcome: "skip", reason: result.reason };
    if (dupes.has(i)) return { i, outcome: "skip", reason: "duplicate_in_file" };
    const plan = planFittingRow(result.row, existing);
    return plan.outcome === "skip" ? { i, outcome: "skip", reason: plan.reason } : { i, outcome: plan.outcome };
  });
}

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

export type PreviewMatchRow = {
  match: "email" | "phone" | "key";
  key: string;
  customer_id: string;
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
