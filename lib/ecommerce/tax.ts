import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Tax module — computes order tax from a configurable region/rate table.
 *
 * The arithmetic (`computeTax`, `computeOrderTotal`) is intentionally pure and
 * dependency-free so it can be unit-tested over region/rate inputs in
 * isolation. Persistence lives in the DB-backed loaders (`getActiveTaxRules`,
 * `resolveTaxRuleForRegion`), which fall back to {@link DEFAULT_TAX_RULES} when
 * no rates have been configured yet.
 *
 * Rate model (confirmed): Singapore GST at 9%, applied tax-EXCLUSIVE (added on
 * top of the displayed price), on the subtotal only (shipping is not taxed),
 * SG-only — orders shipped elsewhere are untaxed. Each field stays configurable
 * per row in the `tax_rates` table.
 */

/**
 * Whether the configured rate is already baked into the displayed/line-item
 * prices (`inclusive`) or is added on top at checkout (`exclusive`).
 *
 * - `exclusive`: total = subtotal − discount + shipping + tax. The Stripe
 *   session gets an explicit tax line item.
 * - `inclusive`: total = subtotal − discount + shipping. Tax is only recorded
 *   as the embedded component for reporting; no extra Stripe line item.
 */
export type TaxMode = "exclusive" | "inclusive";

export interface TaxRule {
  /** ISO-3166 alpha-2 country code, or "*" as a catch-all fallback. */
  region: string;
  /** Display name for the tax line (e.g. "GST", "SST"). */
  name: string;
  /** Rate as a decimal fraction, e.g. 0.09 for 9%. */
  rate: number;
  mode: TaxMode;
  /** Whether shipping is part of the taxable base. */
  appliesToShipping: boolean;
}

export interface TaxInput {
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
}

export interface TaxResult {
  /** Tax owed (exclusive) or embedded (inclusive), rounded to 2 dp. */
  taxAmount: number;
  /** Amount the rate was applied to, rounded to 2 dp. */
  taxableBase: number;
  rate: number;
  region: string;
  name: string;
  mode: TaxMode;
}

/**
 * Default rule set — used when the `tax_rates` table is empty or unreachable.
 * Mirrors the confirmed rate model (see the note at the top of this file).
 */
export const DEFAULT_TAX_RULES: TaxRule[] = [
  { region: "SG", name: "GST", rate: 0.09, mode: "exclusive", appliesToShipping: false },
];

/** Round to 2 decimal places (currency), avoiding binary float drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A zero-tax result for a given input, used when no rule applies. */
function zeroTax(region = "", name = ""): TaxResult {
  return {
    taxAmount: 0,
    taxableBase: 0,
    rate: 0,
    region,
    name,
    mode: "exclusive",
  };
}

/**
 * Pure tax calculation. Given monetary inputs and a resolved rule, returns the
 * tax amount and the base it was applied to. Discounts always reduce the
 * taxable base; shipping is included only when `rule.appliesToShipping`.
 */
export function computeTax(input: TaxInput, rule: TaxRule | null): TaxResult {
  if (!rule || rule.rate <= 0) {
    return zeroTax(rule?.region, rule?.name);
  }

  const subtotal = Math.max(0, input.subtotal);
  const shippingAmount = Math.max(0, input.shippingAmount);
  const discountAmount = Math.max(0, input.discountAmount);

  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const taxableBase =
    discountedSubtotal + (rule.appliesToShipping ? shippingAmount : 0);

  const taxAmount =
    rule.mode === "inclusive"
      ? taxableBase - taxableBase / (1 + rule.rate)
      : taxableBase * rule.rate;

  return {
    taxAmount: round2(taxAmount),
    taxableBase: round2(taxableBase),
    rate: rule.rate,
    region: rule.region,
    name: rule.name,
    mode: rule.mode,
  };
}

/**
 * Order grand total given the inputs and computed tax. For inclusive tax the
 * amount is already embedded, so it is NOT added again.
 */
export function computeOrderTotal(input: TaxInput, tax: TaxResult): number {
  const base =
    Math.max(0, Math.max(0, input.subtotal) - Math.max(0, input.discountAmount)) +
    Math.max(0, input.shippingAmount);
  return round2(tax.mode === "inclusive" ? base : base + tax.taxAmount);
}

/**
 * Pick the rule for a region from a rule set: exact (case-insensitive) match
 * first, then a "*" catch-all, otherwise null (no tax).
 */
export function resolveTaxRule(
  region: string | null | undefined,
  rules: TaxRule[]
): TaxRule | null {
  const normalized = (region ?? "").trim().toUpperCase();
  if (normalized) {
    const exact = rules.find((r) => r.region.trim().toUpperCase() === normalized);
    if (exact) return exact;
  }
  return rules.find((r) => r.region.trim() === "*") ?? null;
}

type TaxRateRow = {
  region: string;
  name: string;
  rate: number | string;
  mode: string;
  applies_to_shipping: boolean;
};

function rowToRule(row: TaxRateRow): TaxRule {
  return {
    region: row.region,
    name: row.name,
    rate: typeof row.rate === "string" ? Number(row.rate) : row.rate,
    mode: row.mode === "inclusive" ? "inclusive" : "exclusive",
    appliesToShipping: row.applies_to_shipping !== false,
  };
}

/**
 * Load active tax rules from the DB, falling back to {@link DEFAULT_TAX_RULES}
 * when the table is empty or unavailable so checkout never silently drops tax.
 */
export async function getActiveTaxRules(): Promise<TaxRule[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("tax_rates")
    .select("region, name, rate, mode, applies_to_shipping")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error || !data || data.length === 0) {
    return DEFAULT_TAX_RULES;
  }
  return (data as TaxRateRow[]).map(rowToRule);
}

/** Resolve the applicable tax rule for a shipping region (DB-backed). */
export async function resolveTaxRuleForRegion(
  region: string | null | undefined
): Promise<TaxRule | null> {
  const rules = await getActiveTaxRules();
  return resolveTaxRule(region, rules);
}
