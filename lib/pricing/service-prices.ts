import type { SupabaseClient } from "@supabase/supabase-js";

export const SERVICE_KEYS = ["measurement_premium", "measurement_basic", "readjustment"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type ServicePrice = { msrp: number; costPrice: number | null; currency: string };
export type ServicePrices = Record<ServiceKey, ServicePrice>;

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  measurement_premium: "Measurement service (Premium)",
  measurement_basic: "Measurement service (Basic)",
  readjustment: "Re-adjustment service",
};

export const SERVICE_SKUS: Record<ServiceKey, string> = {
  measurement_premium: "SERVICE-MEASUREMENT-PREMIUM",
  measurement_basic: "SERVICE-MEASUREMENT-BASIC",
  readjustment: "SERVICE-READJUSTMENT",
};

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === "string" && (SERVICE_KEYS as readonly string[]).includes(value);
}

type Row = { key: string; msrp: string | number | null; cost_price: string | number | null; currency: string | null };

export function parseServicePrices(rows: Row[]): ServicePrices {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = {} as ServicePrices;
  for (const key of SERVICE_KEYS) {
    const row = byKey.get(key);
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

export const READJUSTMENT_POLICY_KEYS = [
  "readjustment_free_visits",
  "readjustment_free_window_days",
] as const;

export type ReadjustmentPolicy = { freeVisits: number; freeWindowDays: number };

export const DEFAULT_READJUSTMENT_POLICY: ReadjustmentPolicy = { freeVisits: 1, freeWindowDays: 60 };

export const READJUSTMENT_POLICY_LIMITS = { freeVisits: 10, freeWindowDays: 365 } as const;

export const READJUSTMENT_MIN_FEE_CENTS = 50;

export function isValidReadjustmentFeeCents(cents: number): boolean {
  return cents === 0 || cents >= READJUSTMENT_MIN_FEE_CENTS;
}

function parseCount(raw: string | undefined, fallback: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
}

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
