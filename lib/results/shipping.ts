import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { isAnchor, shipsWithAnchor, type PairedRow } from "@/lib/results/paired-build";
import { estimateLines } from "@/lib/shipping/lines";
import { normalizePostalCode, quoteShippingMethods } from "@/lib/shipping/quote";
import { readShippingSettings } from "@/lib/shipping/settings";
import type { PackageType } from "@/lib/shipping/types";
import type { ShippingMethod } from "@/lib/types/ecommerce";

/**
 * A customisation's shipping (ADR 0032). A live method is quoted once, when the
 * shipping is chosen, and the rate is kept on the Result (`shipping_rate`):
 * the hold, assign, finish and accept are days apart, and every one of them
 * must charge the price the customer was shown.
 */

export const RESULT_SHIPPING_UNAVAILABLE =
  "This shipping method is not available for this address right now. Please choose another method.";

export function isLiveMethod(method: Pick<ShippingMethod, "rate_source">): boolean {
  return (method.rate_source ?? "flat") === "easyship";
}

/**
 * The boxes a Result's shipment holds: its own build, and a Paired build's
 * Mbolster with its Mpillow (ADR 0026). A companion ships in its anchor's box
 * and quotes nothing of its own.
 */
export function resultParcelTypes(row: PairedRow & { product_type: string | null }): PackageType[] {
  if (shipsWithAnchor(row)) return [];
  const own: PackageType = row.product_type === "bolster" ? "bolster" : "pillow";
  return isAnchor(row) ? [own, "bolster"] : [own];
}

/**
 * What a Result charges for shipping: the rate quoted for its address when a
 * live method was chosen, else the method's base_rate. free_above is earned by
 * goods either way, so a re-assigned tier can still cross it.
 */
export function resultShippingAmount(
  method: ShippingMethod,
  quotedRate: number | string | null | undefined,
  goodsSubtotal: number,
): number {
  const rate = quotedRate == null ? Number(method.base_rate) : Number(quotedRate);
  return calculateShippingRate({ ...method, base_rate: rate }, goodsSubtotal);
}

type Destination = { country: string; postal_code?: string | null; city?: string | null; state?: string | null };

/** Whether two addresses quote alike: couriers price by country and postal code. */
export function sameQuoteDestination(a: unknown, b: Destination): boolean {
  if (!a || typeof a !== "object") return false;
  const prev = a as Partial<Destination>;
  return (
    String(prev.country ?? "").toUpperCase() === b.country.toUpperCase() &&
    normalizePostalCode(String(prev.postal_code ?? "")) === normalizePostalCode(b.postal_code ?? "")
  );
}

/**
 * The rate to store for a chosen method: null for a flat one (its base_rate is
 * read at every repricing, as before), the live price for a live one. Built from
 * the same lines as the configurator's quote (`estimateLines`), so within the
 * quote TTL it reads the rate the page showed. A live method with no courier
 * for the address is refused, never charged its base_rate (ADR 0022).
 */
export async function quoteResultShipping(
  admin: SupabaseClient,
  input: { method: ShippingMethod; parcelTypes: PackageType[]; destination: Destination },
): Promise<{ ok: true; rate: number | null } | { ok: false; error: string }> {
  if (!isLiveMethod(input.method) || input.parcelTypes.length === 0) return { ok: true, rate: null };
  let settings;
  try {
    settings = await readShippingSettings();
  } catch (err) {
    console.error("[results/shipping] Could not read shipping settings:", err);
    return { ok: false, error: RESULT_SHIPPING_UNAVAILABLE };
  }
  const { options } = await quoteShippingMethods(admin, {
    methods: [input.method],
    lines: estimateLines(input.parcelTypes, settings.estimate_declared_value, input.method.currency),
    destination: {
      country: input.destination.country,
      postal_code: input.destination.postal_code ?? "",
      city: input.destination.city ?? null,
      state: input.destination.state ?? null,
    },
    // Before free_above, like the page's quote: it is applied to goods at every repricing.
    subtotal: 0,
    loadSettings: async () => settings,
  });
  const option = options[0];
  if (!option) return { ok: false, error: RESULT_SHIPPING_UNAVAILABLE };
  return { ok: true, rate: option.amount };
}
