import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { isAnchor, shipsWithAnchor, type PairedRow } from "@/lib/results/paired-build";
import { estimateLines } from "@/lib/shipping/lines";
import { normalizePostalCode, quoteShippingMethods } from "@/lib/shipping/quote";
import { readShippingSettings } from "@/lib/shipping/settings";
import type { PackageType } from "@/lib/shipping/types";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const RESULT_SHIPPING_UNAVAILABLE =
  "This shipping method is not available for this address right now. Please choose another method.";

export function isLiveMethod(method: Pick<ShippingMethod, "rate_source">): boolean {
  return (method.rate_source ?? "flat") === "easyship";
}

export function resultParcelTypes(row: PairedRow & { product_type: string | null }): PackageType[] {
  if (shipsWithAnchor(row)) return [];
  const own: PackageType = row.product_type === "bolster" ? "bolster" : "pillow";
  return isAnchor(row) ? [own, "bolster"] : [own];
}

export function resultShippingAmount(
  method: ShippingMethod,
  quotedRate: number | string | null | undefined,
  goodsSubtotal: number,
): number {
  const rate = quotedRate == null ? Number(method.base_rate) : Number(quotedRate);
  return calculateShippingRate({ ...method, base_rate: rate }, goodsSubtotal);
}

type Destination = { country: string; postal_code?: string | null; city?: string | null; state?: string | null };

export function sameQuoteDestination(a: unknown, b: Destination): boolean {
  if (!a || typeof a !== "object") return false;
  const prev = a as Partial<Destination>;
  return (
    String(prev.country ?? "").toUpperCase() === b.country.toUpperCase() &&
    normalizePostalCode(String(prev.postal_code ?? "")) === normalizePostalCode(b.postal_code ?? "")
  );
}

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
    subtotal: 0,
    loadSettings: async () => settings,
  });
  const option = options[0];
  if (!option) return { ok: false, error: RESULT_SHIPPING_UNAVAILABLE };
  return { ok: true, rate: option.amount };
}
