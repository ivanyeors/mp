/**
 * Which Service fees a Result carries (ADR 0024). Pure and free of `supabaseAdmin`,
 * so the configurator preview calls the same rule the money path does.
 *
 * The Measurement service is a fact about who measured, not a choice in a cart:
 * a Result whose `measured_by_type` is `staff` carries the fee for its Tier, and one
 * the customer measured carries nothing. Every surface that shows or charges a Result
 * total gets its service lines here — `pricing-surface.check.ts` enforces it — and
 * nothing else may branch on `measured_by_type` to decide a price.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SERVICE_LABELS,
  loadServicePrices,
  type ServiceKey,
  type ServicePrices,
} from "@/lib/pricing/service-prices";

export type ServiceLine = {
  key: ServiceKey;
  label: string;
  msrp: number;
  costPrice: number | null;
};

/** The Result fields the rule reads. */
export type ServiceFeeRow = {
  measured_by_type?: string | null;
  product_type?: string | null;
  assigned_tier?: string | null;
  suggested_tier?: string | null;
};

/**
 * The measurement Service a Result owes, or null.
 *
 * Tier is `assigned_tier ?? suggested_tier`, so an upsell or a Staff tier change at
 * assign moves the fee with it. Mbolster carries no measurement fee, whoever
 * measured (owner, 2026-10-13).
 */
export function measurementServiceKey(row: ServiceFeeRow): ServiceKey | null {
  if (row.measured_by_type !== "staff") return null;
  if (row.product_type === "bolster") return null;
  const tier = row.assigned_tier ?? row.suggested_tier;
  return tier === "premium" ? "measurement_premium" : "measurement_basic";
}

/**
 * Every Service fee line a Result carries. `prices` may be null only when the Result
 * owes none; a fee that is owed but cannot be priced throws rather than reading as free.
 */
export function resultServiceLines(row: ServiceFeeRow, prices: ServicePrices | null): ServiceLine[] {
  const key = measurementServiceKey(row);
  if (!key) return [];
  if (!prices) throw new Error(`Service price for "${key}" is required but was not loaded`);
  const price = prices[key];
  return [{ key, label: SERVICE_LABELS[key], msrp: price.msrp, costPrice: price.costPrice }];
}

/** Server helper: load prices only when the Result owes a fee, then resolve its lines. */
export async function loadResultServiceLines(
  admin: SupabaseClient,
  row: ServiceFeeRow,
): Promise<ServiceLine[]> {
  if (!measurementServiceKey(row)) return resultServiceLines(row, null);
  return resultServiceLines(row, await loadServicePrices(admin));
}

export function sumServiceLines(lines: ReadonlyArray<Pick<ServiceLine, "msrp">>): number {
  return lines.reduce((s, l) => s + l.msrp, 0);
}

/**
 * The Service fee lines a stored total actually quoted.
 *
 * A Result priced before Service fees existed (assigned before ADR 0024 shipped)
 * carries a `final_amount` without the fee, and that is what the customer is
 * charged. Repricing it today adds the fee, so an Order written from the reprice
 * would list a line nobody paid for. When the stored total equals today's total
 * less the fees, the fees were not quoted and no fee line is written or shown.
 */
export function quotedServiceLines(
  storedTotal: number | null,
  pricing: { total: number; services: number },
  lines: ServiceLine[],
): ServiceLine[] {
  if (storedTotal == null || lines.length === 0 || pricing.services <= 0) return lines;
  const withoutFees = pricing.total - pricing.services;
  return Math.abs(storedTotal - withoutFees) < 0.005 && Math.abs(storedTotal - pricing.total) >= 0.005
    ? []
    : lines;
}
