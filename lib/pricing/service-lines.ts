import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SERVICE_LABELS,
  loadServicePrices,
  type ServiceFees,
  type ServiceKey,
  type ServicePrices,
} from "@/lib/pricing/service-prices";

export type ServiceLine = {
  key: ServiceKey;
  label: string;
  msrp: number;
  costPrice: number | null;
};

export type ServiceFeeRow = {
  measured_by_type?: string | null;
  product_type?: string | null;
  assigned_tier?: string | null;
  suggested_tier?: string | null;
};

export function measurementServiceKey(row: ServiceFeeRow): ServiceKey | null {
  if (row.measured_by_type !== "staff") return null;
  if (row.product_type === "bolster") return null;
  const tier = row.assigned_tier ?? row.suggested_tier;
  return tier === "premium" ? "measurement_premium" : "measurement_basic";
}

export function resultServiceLines(row: ServiceFeeRow, prices: ServicePrices | ServiceFees | null): ServiceLine[] {
  const key = measurementServiceKey(row);
  if (!key) return [];
  if (!prices) throw new Error(`Service price for "${key}" is required but was not loaded`);
  const price = prices[key];
  return [{ key, label: SERVICE_LABELS[key], msrp: price.msrp, costPrice: "costPrice" in price ? price.costPrice : null }];
}

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
