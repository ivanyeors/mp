import { supabaseAdmin } from "@/lib/supabase/server";

export type TaxMode = "exclusive" | "inclusive";

export interface TaxRule {
  region: string;
  name: string;
  rate: number;
  mode: TaxMode;
  appliesToShipping: boolean;
}

export interface TaxInput {
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
}

export interface TaxResult {
  taxAmount: number;
  taxableBase: number;
  rate: number;
  region: string;
  name: string;
  mode: TaxMode;
}

export const SG_GST_RULE: TaxRule = {
  region: "SG",
  name: "GST",
  rate: 0.09,
  mode: "exclusive",
  appliesToShipping: false,
};

export const DEFAULT_TAX_RULES: TaxRule[] = [];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

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

export function computeOrderTotal(input: TaxInput, tax: TaxResult): number {
  const base =
    Math.max(0, Math.max(0, input.subtotal) - Math.max(0, input.discountAmount)) +
    Math.max(0, input.shippingAmount);
  return round2(tax.mode === "inclusive" ? base : base + tax.taxAmount);
}

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

export async function resolveTaxRuleForRegion(
  region: string | null | undefined
): Promise<TaxRule | null> {
  const rules = await getActiveTaxRules();
  return resolveTaxRule(region, rules);
}
