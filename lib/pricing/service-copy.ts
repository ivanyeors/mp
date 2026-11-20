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

export async function loadServiceCopyValues(admin: SupabaseClient): Promise<ServiceCopyValues> {
  try {
    const [prices, policy] = await Promise.all([loadServicePrices(admin), loadReadjustmentPolicy(admin)]);
    return serviceCopyValues(prices, policy);
  } catch {
    return DEFAULT_SERVICE_COPY_VALUES;
  }
}
