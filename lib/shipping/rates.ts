import type { EasyshipStrategy, ShippingMethod } from "@/lib/types/ecommerce";
import type { CourierRate } from "@/lib/shipping/types";

type RawRecord = Record<string, unknown>;

function asRecord(v: unknown): RawRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as RawRecord) : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Normalise an Easyship `POST /rates` response into CourierRates.
 *
 * Reads the 2024-09 shape (`rates[].courier_service.{id,name,umbrella_name}`) and
 * the 2023-01 one (`rates[].courier_id`, `courier_name`), so pinning
 * EASYSHIP_API_VERSION back a version does not silently empty every quote. A rate
 * without an id or a usable price is dropped rather than guessed at.
 */
export function normalizeEasyshipRates(raw: unknown): CourierRate[] {
  const body = asRecord(raw);
  const list = Array.isArray(body?.rates) ? (body!.rates as unknown[]) : [];
  const rates: CourierRate[] = [];
  for (const entry of list) {
    const r = asRecord(entry);
    if (!r) continue;
    const service = asRecord(r.courier_service);
    const id = str(service?.id) ?? str(r.courier_service_id) ?? str(r.courier_id);
    const total = num(r.total_charge) ?? num(r.shipment_charge_total);
    const currency = str(r.currency);
    if (!id || total == null || total < 0 || !currency) continue;
    const min = num(r.min_delivery_time);
    const max = num(r.max_delivery_time);
    rates.push({
      courier_service_id: id,
      courier_name:
        str(service?.name) ?? str(r.courier_name) ?? str(r.full_description) ?? str(r.description) ?? id,
      umbrella_name: str(service?.umbrella_name) ?? str(r.courier_umbrella_name),
      total_charge: Math.round(total * 100) / 100,
      currency: currency.toUpperCase(),
      min_days: min,
      max_days: max ?? min,
      cost_rank: num(r.cost_rank),
      delivery_time_rank: num(r.delivery_time_rank),
      value_for_money_rank: num(r.value_for_money_rank),
    });
  }
  return rates;
}

const cheaper = (a: CourierRate, b: CourierRate) =>
  a.total_charge - b.total_charge || (a.max_days ?? 99) - (b.max_days ?? 99);
const faster = (a: CourierRate, b: CourierRate) =>
  (a.max_days ?? 99) - (b.max_days ?? 99) ||
  (a.min_days ?? 99) - (b.min_days ?? 99) ||
  a.total_charge - b.total_charge;
const betterValue = (a: CourierRate, b: CourierRate) =>
  (a.value_for_money_rank ?? 99) - (b.value_for_money_rank ?? 99) || cheaper(a, b);

/**
 * The one courier an Easyship method offers. Deterministic: ties break on the
 * other dimension, then on the service id, so the page and the checkout route
 * always land on the same courier for the same rates.
 */
export function pickRate(
  rates: CourierRate[],
  strategy: EasyshipStrategy,
  courierServiceId?: string | null,
): CourierRate | null {
  if (rates.length === 0) return null;
  if (strategy === "courier") {
    return rates.find((r) => r.courier_service_id === courierServiceId) ?? null;
  }
  const order = strategy === "fastest" ? faster : strategy === "best_value" ? betterValue : cheaper;
  return (
    [...rates].sort(
      (a, b) => order(a, b) || a.courier_service_id.localeCompare(b.courier_service_id),
    )[0] ?? null
  );
}

/**
 * The shopper's price for a courier cost: percent markup, then fixed markup, then
 * rounded UP to the method's increment (so 7.13 at 0.50 shows 7.50). Never
 * negative — a subsidy can bring shipping to zero, not below it.
 */
export function priceLiveRate(
  carrierCost: number,
  method: Pick<ShippingMethod, "markup_percent" | "markup_fixed" | "rate_rounding">,
): number {
  const pct = Number(method.markup_percent ?? 0);
  const fixed = Number(method.markup_fixed ?? 0);
  const step = Number(method.rate_rounding ?? 0);
  let price = carrierCost * (1 + pct / 100) + fixed;
  // Strip float noise before rounding up, or 7.5000000001 becomes 8.00.
  price = Math.round(price * 100) / 100;
  if (step > 0) price = Math.ceil(Math.round((price / step) * 1e6) / 1e6) * step;
  return Math.max(0, Math.round(price * 100) / 100);
}

/** Courier transit days plus the store's handling days, for display. */
export function deliveryWindow(
  rate: Pick<CourierRate, "min_days" | "max_days">,
  handlingDays: number,
): { min_days: number | null; max_days: number | null } {
  const handling = Math.max(0, Math.round(handlingDays));
  return {
    min_days: rate.min_days == null ? null : rate.min_days + handling,
    max_days: rate.max_days == null ? null : rate.max_days + handling,
  };
}
