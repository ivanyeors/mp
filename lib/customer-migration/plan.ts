import {
  normaliseShopifyRow,
  type NormaliseResult,
  type NormalisedShopifyRow,
  type RowInvalidReason,
  type RowRepair,
  type ShopifyRawRow,
} from "./shopify-csv";

export type SkipReason =
  | RowInvalidReason
  | "duplicate_email_in_file"
  | "duplicate_customer_id_in_file"
  | "email_already_migrated";

export type PlanOutcome = "create" | "merge" | "already_imported" | "skip";

export const PLAN_OUTCOMES: readonly PlanOutcome[] = ["create", "merge", "already_imported", "skip"];

export type ExistingCustomer = {
  customer_id: string;
  has_account: boolean;
  has_first_name: boolean;
  has_last_name: boolean;
  has_phone: boolean;
  has_address: boolean;
  migrated: { shopify_customer_id: string | null } | null;
};

export type ExistingLookup = {
  customersByEmail: ReadonlyMap<string, ExistingCustomer>;
  migratedShopifyIds: ReadonlySet<string>;
};

export const NO_EXISTING: ExistingLookup = { customersByEmail: new Map(), migratedShopifyIds: new Set() };

export type MergeFill = "first_name" | "last_name" | "phone" | "address";

export type RowPlan =
  | { outcome: "create" }
  | { outcome: "merge"; customer_id: string; fill: MergeFill[] }
  | { outcome: "already_imported" }
  | { outcome: "skip"; reason: SkipReason };

export function planCustomerRow(row: NormalisedShopifyRow, existing: ExistingLookup): RowPlan {
  const id = row.shopify_customer_id;
  if (id && existing.migratedShopifyIds.has(id)) return { outcome: "already_imported" };

  const customer = existing.customersByEmail.get(row.email);
  if (customer?.migrated) {
    const theirs = customer.migrated.shopify_customer_id;
    if (id && theirs && id !== theirs) return { outcome: "skip", reason: "email_already_migrated" };
    return { outcome: "already_imported" };
  }

  if (customer) {
    const fill: MergeFill[] = [];
    if (!customer.has_first_name && row.first_name) fill.push("first_name");
    if (!customer.has_last_name && row.last_name) fill.push("last_name");
    if (!customer.has_phone && row.phone) fill.push("phone");
    if (!customer.has_address && row.address) fill.push("address");
    return { outcome: "merge", customer_id: customer.customer_id, fill };
  }

  return { outcome: "create" };
}

export type IndexedRawRow = { i: number; raw: ShopifyRawRow };
export type IndexedNormalised = { i: number; result: NormaliseResult };

export type RowPreview = {
  i: number;
  outcome: PlanOutcome;
  reason?: SkipReason;
  repairs: RowRepair[];
};

export function normaliseRows(rows: readonly IndexedRawRow[]): IndexedNormalised[] {
  return rows.map(({ i, raw }) => ({ i, result: normaliseShopifyRow(raw) }));
}

export function duplicateSkips(rows: readonly IndexedNormalised[]): Map<number, SkipReason> {
  const emails = new Map<string, number>();
  const ids = new Map<string, number>();
  for (const { result } of rows) {
    if (!result.ok) continue;
    emails.set(result.row.email, (emails.get(result.row.email) ?? 0) + 1);
    const id = result.row.shopify_customer_id;
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const out = new Map<number, SkipReason>();
  for (const { i, result } of rows) {
    if (!result.ok) continue;
    const id = result.row.shopify_customer_id;
    if ((emails.get(result.row.email) ?? 0) > 1) out.set(i, "duplicate_email_in_file");
    else if (id && (ids.get(id) ?? 0) > 1) out.set(i, "duplicate_customer_id_in_file");
  }
  return out;
}

export function lookupKeys(rows: readonly IndexedNormalised[]): { emails: string[]; shopifyIds: string[] } {
  const emails = new Set<string>();
  const shopifyIds = new Set<string>();
  for (const { result } of rows) {
    if (!result.ok) continue;
    emails.add(result.row.email);
    if (result.row.shopify_customer_id) shopifyIds.add(result.row.shopify_customer_id);
  }
  return { emails: [...emails], shopifyIds: [...shopifyIds] };
}

export function planRows(rows: readonly IndexedNormalised[], existing: ExistingLookup): RowPreview[] {
  const dupes = duplicateSkips(rows);
  return rows.map(({ i, result }) => {
    if (!result.ok) return { i, outcome: "skip", reason: result.reason, repairs: [] };
    const dupe = dupes.get(i);
    if (dupe) return { i, outcome: "skip", reason: dupe, repairs: [] };
    const plan = planCustomerRow(result.row, existing);
    if (plan.outcome === "skip") return { i, outcome: "skip", reason: plan.reason, repairs: [] };
    const writes = plan.outcome === "create" || plan.outcome === "merge";
    return { i, outcome: plan.outcome, repairs: writes ? result.repairs : [] };
  });
}

export type PreviewMatchRow = {
  match: "email" | "shopify_id";
  key: string;
  customer_id: string;
  has_account: boolean | null;
  has_first_name: boolean | null;
  has_last_name: boolean | null;
  has_phone: boolean | null;
  has_address: boolean | null;
  migrated: boolean | null;
  migrated_shopify_customer_id: string | null;
};

export function existingFromMatches(rows: readonly PreviewMatchRow[]): ExistingLookup {
  const customersByEmail = new Map<string, ExistingCustomer>();
  const migratedShopifyIds = new Set<string>();
  for (const r of rows) {
    if (r.match === "shopify_id") {
      migratedShopifyIds.add(String(r.key));
      continue;
    }
    customersByEmail.set(r.key, {
      customer_id: r.customer_id,
      has_account: Boolean(r.has_account),
      has_first_name: Boolean(r.has_first_name),
      has_last_name: Boolean(r.has_last_name),
      has_phone: Boolean(r.has_phone),
      has_address: Boolean(r.has_address),
      migrated: r.migrated ? { shopify_customer_id: r.migrated_shopify_customer_id ?? null } : null,
    });
  }
  return { customersByEmail, migratedShopifyIds };
}
