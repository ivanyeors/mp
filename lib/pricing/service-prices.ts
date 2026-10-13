/**
 * Service prices (ADR 0024): the only reader of `service_prices`.
 *
 * A Service is a price without a part — Mpillow's labour, priced in Costings but
 * never an Item, so it is never a build line and never stock-checked. Every surface
 * that shows or charges a service fee gets its number from here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const SERVICE_KEYS = ["measurement_premium", "measurement_basic", "readjustment"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type ServicePrice = { msrp: number; costPrice: number | null; currency: string };
export type ServicePrices = Record<ServiceKey, ServicePrice>;

/** Customer-facing names, as they appear on a receipt line. */
export const SERVICE_LABELS: Record<ServiceKey, string> = {
  measurement_premium: "Measurement service (Premium)",
  measurement_basic: "Measurement service (Basic)",
  readjustment: "Re-adjustment service",
};

/** Order line SKUs (`order_items.sku`) for a service line. */
export const SERVICE_SKUS: Record<ServiceKey, string> = {
  measurement_premium: "SERVICE-MEASUREMENT-PREMIUM",
  measurement_basic: "SERVICE-MEASUREMENT-BASIC",
  readjustment: "SERVICE-READJUSTMENT",
};

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === "string" && (SERVICE_KEYS as readonly string[]).includes(value);
}

type Row = { key: string; msrp: string | number | null; cost_price: string | number | null; currency: string | null };

/** Rows → prices. Throws when a key is missing: a missing price is a broken deploy, not a free service. */
export function parseServicePrices(rows: Row[]): ServicePrices {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = {} as ServicePrices;
  for (const key of SERVICE_KEYS) {
    const row = byKey.get(key);
    // Number(null) is 0 — a null MSRP must read as missing, never as free.
    const msrp = row && row.msrp != null && row.msrp !== "" ? Number(row.msrp) : Number.NaN;
    if (!row || !Number.isFinite(msrp) || msrp < 0) {
      throw new Error(`service_prices is missing a valid price for "${key}"`);
    }
    const cost = row.cost_price == null ? null : Number(row.cost_price);
    out[key] = {
      msrp,
      costPrice: cost != null && Number.isFinite(cost) ? cost : null,
      currency: row.currency ?? "SGD",
    };
  }
  return out;
}

export async function loadServicePrices(admin: SupabaseClient): Promise<ServicePrices> {
  const { data, error } = await admin.from("service_prices").select("key, msrp, cost_price, currency");
  if (error) throw new Error(error.message);
  return parseServicePrices((data ?? []) as Row[]);
}

// --- Complimentary re-adjustment rule ---------------------------------------

export const READJUSTMENT_POLICY_KEYS = [
  "readjustment_free_visits",
  "readjustment_free_window_days",
] as const;

export type ReadjustmentPolicy = { freeVisits: number; freeWindowDays: number };

export const DEFAULT_READJUSTMENT_POLICY: ReadjustmentPolicy = { freeVisits: 1, freeWindowDays: 60 };

export const READJUSTMENT_POLICY_LIMITS = { freeVisits: 10, freeWindowDays: 365 } as const;

function parseCount(raw: string | undefined, fallback: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
}

/** Stored `site_settings` strings → policy, falling back per key on anything unparseable. */
export function parseReadjustmentPolicy(stored: Record<string, string>): ReadjustmentPolicy {
  return {
    freeVisits: parseCount(
      stored.readjustment_free_visits,
      DEFAULT_READJUSTMENT_POLICY.freeVisits,
      READJUSTMENT_POLICY_LIMITS.freeVisits,
    ),
    freeWindowDays: parseCount(
      stored.readjustment_free_window_days,
      DEFAULT_READJUSTMENT_POLICY.freeWindowDays,
      READJUSTMENT_POLICY_LIMITS.freeWindowDays,
    ),
  };
}

export async function loadReadjustmentPolicy(admin: SupabaseClient): Promise<ReadjustmentPolicy> {
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", [...READJUSTMENT_POLICY_KEYS]);
  if (error) throw new Error(error.message);
  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key as string] = row.value as string;
  return parseReadjustmentPolicy(stored);
}
