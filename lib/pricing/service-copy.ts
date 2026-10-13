/**
 * Policy copy that reads its numbers from Costings → Service fees (ADR 0024).
 *
 * The fees used to be typed into the website as "$30" and "$50" in several
 * places — and the copy contradicted itself. Strings now carry placeholders, and
 * every place that renders them fills them from the live prices, so an operator
 * changing a fee never leaves the site quoting the old one. Pure and client-safe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_READJUSTMENT_POLICY,
  loadReadjustmentPolicy,
  loadServicePrices,
  type ReadjustmentPolicy,
  type ServicePrices,
} from "@/lib/pricing/service-prices";

export type ServiceCopyValues = {
  measurementPremium: string;
  measurementBasic: string;
  readjustmentFee: string;
  freeWindowDays: string;
};

/** Whole dollars print without cents ("$30"); anything else keeps them ("$30.50"). */
export function copyMoney(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function serviceCopyValues(prices: ServicePrices, policy: ReadjustmentPolicy): ServiceCopyValues {
  return {
    measurementPremium: copyMoney(prices.measurement_premium.msrp),
    measurementBasic: copyMoney(prices.measurement_basic.msrp),
    readjustmentFee: copyMoney(prices.readjustment.msrp),
    freeWindowDays: String(policy.freeWindowDays),
  };
}

/**
 * Shown only until the live values arrive (client) or if they cannot be read.
 * These are the migration's seeds — the same numbers the policy launched with.
 */
export const DEFAULT_SERVICE_COPY_VALUES: ServiceCopyValues = {
  measurementPremium: "$50",
  measurementBasic: "$30",
  readjustmentFee: "$30",
  freeWindowDays: String(DEFAULT_READJUSTMENT_POLICY.freeWindowDays),
};

const PLACEHOLDER = /\{(measurementPremium|measurementBasic|readjustmentFee|freeWindowDays)\}/g;

export function interpolateServiceCopy(text: string, values: ServiceCopyValues): string {
  return text.replace(PLACEHOLDER, (_, key: keyof ServiceCopyValues) => values[key]);
}

/** Fill placeholders in every string of a messages tree (arrays and objects included). */
export function interpolateServiceCopyDeep<T>(value: T, values: ServiceCopyValues): T {
  if (typeof value === "string") return interpolateServiceCopy(value, values) as T;
  if (Array.isArray(value)) return value.map((v) => interpolateServiceCopyDeep(v, values)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateServiceCopyDeep(v, values);
    }
    return out as T;
  }
  return value;
}

/** Server: today's copy values, or the launch defaults if Costings cannot be read. */
export async function loadServiceCopyValues(admin: SupabaseClient): Promise<ServiceCopyValues> {
  try {
    const [prices, policy] = await Promise.all([loadServicePrices(admin), loadReadjustmentPolicy(admin)]);
    return serviceCopyValues(prices, policy);
  } catch {
    return DEFAULT_SERVICE_COPY_VALUES;
  }
}
