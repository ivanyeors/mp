import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import type { ShippingMethod } from "@/lib/types/ecommerce";
import {
  EasyshipError,
  easyshipConfig,
  ratesRequestBody,
  requestRates,
  type EasyshipConfig,
} from "@/lib/shipping/easyship";
import { buildParcels } from "@/lib/shipping/parcels";
import { deliveryWindow, normalizeEasyshipRates, pickRate, priceLiveRate } from "@/lib/shipping/rates";
import { missingOriginFields } from "@/lib/shipping/settings";
import type {
  CourierRate,
  Parcel,
  RatesResult,
  ShippableLine,
  ShippingDestination,
  ShippingQuoteOption,
  ShippingSettings,
} from "@/lib/shipping/types";

/** Postal codes compare without spaces or case, so "s 123 456" and "S123456" share a quote. */
export function normalizePostalCode(postal: string): string {
  return postal.replace(/\s+/g, "").toUpperCase();
}

/**
 * The cache key for one rate request: everything a courier prices on, nothing it
 * does not. Descriptions and SKUs are left out so a renamed product does not miss
 * the cache; street lines are left out because rates are by postal code.
 */
export function quoteCacheKey(input: {
  settings: Pick<ShippingSettings, "origin_address" | "incoterms" | "insure_shipments">;
  destination: ShippingDestination;
  parcels: Parcel[];
  currency: string;
}): string {
  const fingerprint = {
    v: 1,
    origin: [
      (input.settings.origin_address.country_alpha2 ?? "").toUpperCase(),
      normalizePostalCode(input.settings.origin_address.postal_code ?? ""),
    ],
    to: [input.destination.country.toUpperCase(), normalizePostalCode(input.destination.postal_code)],
    incoterms: input.settings.incoterms,
    insured: input.settings.insure_shipments,
    currency: input.currency.toUpperCase(),
    parcels: input.parcels.map((p) => [
      p.length_cm,
      p.width_cm,
      p.height_cm,
      p.weight_kg,
      p.items.map((i) => [i.quantity, i.weight_kg, i.declared_value, i.currency]),
    ]),
  };
  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
}

export interface FetchRatesInput {
  settings: ShippingSettings;
  destination: ShippingDestination;
  parcels: Parcel[] | null;
  currency: string;
  /** Skip the cache read — the Settings test tool and label purchase want today's price. */
  fresh?: boolean;
  config?: EasyshipConfig | null;
  fetchImpl?: typeof fetch;
  now?: Date;
}

/**
 * Live courier rates for one destination and set of parcels.
 *
 * A fresh Easyship answer is stored in `shipping_rate_quotes` for the settings'
 * TTL; within it, the same cart to the same postal code reads the stored answer
 * instead of calling Easyship again. That is what makes the checkout route charge
 * exactly the rate the checkout page showed without trusting the client: both
 * build the same parcels from the database, hash to the same key, and read the
 * same row.
 */
export async function fetchCourierRates(
  admin: SupabaseClient,
  input: FetchRatesInput,
): Promise<RatesResult> {
  const config = input.config === undefined ? easyshipConfig() : input.config;
  if (!config) {
    return { ok: false, reason: "not_configured", message: "EASYSHIP_API_TOKEN is not set" };
  }
  const missing = missingOriginFields(input.settings.origin_address);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "invalid_origin",
      message: `Ship-from address is missing: ${missing.join(", ")}`,
    };
  }
  if (!input.parcels || input.parcels.length === 0) {
    return { ok: false, reason: "too_many_parcels", message: "This cart cannot be boxed for a live quote" };
  }

  const now = input.now ?? new Date();
  const cacheKey = quoteCacheKey({
    settings: input.settings,
    destination: input.destination,
    parcels: input.parcels,
    currency: input.currency,
  });

  if (!input.fresh) {
    const { data: cached } = await admin
      .from("shipping_rate_quotes")
      .select("id, rates")
      .eq("cache_key", cacheKey)
      .gt("expires_at", now.toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached && Array.isArray(cached.rates)) {
      return { ok: true, rates: cached.rates as CourierRate[], quoteId: cached.id as string, cached: true };
    }
  }

  let rates: CourierRate[];
  try {
    const raw = await requestRates(
      config,
      ratesRequestBody({
        settings: input.settings,
        destination: input.destination,
        parcels: input.parcels,
        currency: input.currency,
      }),
      input.fetchImpl,
    );
    rates = normalizeEasyshipRates(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Easyship request failed";
    // A 4xx about the address or an outage: either way the live methods are hidden.
    console.error("[shipping] Easyship rates failed:", message, err instanceof EasyshipError ? err.details : "");
    return { ok: false, reason: "error", message };
  }

  const expiresAt = new Date(now.getTime() + input.settings.quote_ttl_minutes * 60_000);
  const { data: stored, error: storeError } = await admin
    .from("shipping_rate_quotes")
    .insert({
      cache_key: cacheKey,
      country: input.destination.country.toUpperCase(),
      postal_code: normalizePostalCode(input.destination.postal_code),
      parcels: input.parcels,
      rates,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (storeError) console.error("[shipping] Could not store rate quote:", storeError.message);

  // Housekeeping on the miss path only: quotes older than a day are never read again.
  void admin
    .from("shipping_rate_quotes")
    .delete()
    .lt("expires_at", new Date(now.getTime() - 86_400_000).toISOString())
    .then(({ error }) => {
      if (error) console.error("[shipping] Quote cleanup failed:", error.message);
    });

  return { ok: true, rates, quoteId: (stored?.id as string | undefined) ?? null, cached: false };
}

function freeAbove(method: ShippingMethod, subtotal: number): boolean {
  return method.free_above !== null && method.free_above !== undefined && subtotal >= Number(method.free_above);
}

function flatOption(method: ShippingMethod, subtotal: number): ShippingQuoteOption {
  const amount = calculateShippingRate(method, subtotal);
  return {
    method,
    amount,
    is_free: amount === 0,
    currency: method.currency,
    source: "flat",
    courier: null,
    carrier_cost: null,
    min_days: null,
    max_days: null,
  };
}

/**
 * Price one method from already-fetched rates. Null hides a live method with no
 * courier quote: an outage, no rates, or a currency mismatch. There is no fallback.
 */
export function priceMethod(
  method: ShippingMethod,
  rates: RatesResult | null,
  subtotal: number,
  handlingDays: number,
): ShippingQuoteOption | null {
  if ((method.rate_source ?? "flat") !== "easyship") return flatOption(method, subtotal);
  if (!rates || !rates.ok) return null;

  const currency = method.currency.toUpperCase();
  const usable = rates.rates.filter((r) => r.currency === currency);
  if (usable.length === 0 && rates.rates.length > 0) {
    console.error(
      `[shipping] Easyship quoted in ${rates.rates[0].currency}, method ${method.slug} charges ${currency}; hiding it`,
    );
    return null;
  }
  const rate = pickRate(usable, method.easyship_strategy ?? "cheapest", method.easyship_courier_service_id);
  if (!rate) return null;

  const price = priceLiveRate(rate.total_charge, method);
  const amount = freeAbove(method, subtotal) ? 0 : price;
  return {
    method,
    amount,
    is_free: amount === 0,
    currency: method.currency,
    source: "easyship",
    courier: { service_id: rate.courier_service_id, name: rate.courier_name, umbrella_name: rate.umbrella_name },
    carrier_cost: rate.total_charge,
    ...deliveryWindow(rate, handlingDays),
  };
}

export interface QuoteMethodsInput {
  methods: ShippingMethod[];
  lines: ShippableLine[];
  destination: ShippingDestination;
  subtotal: number;
  /** Loaded lazily: a cart with only flat methods never reads settings or calls Easyship. */
  loadSettings: () => Promise<ShippingSettings>;
  config?: EasyshipConfig | null;
  fetchImpl?: typeof fetch;
}

/**
 * Every method priced for this cart and address, in the methods' order. One
 * Easyship call (or one cache read) serves all the live methods. Methods that
 * cannot ship to the address are left out.
 */
export async function quoteShippingMethods(
  admin: SupabaseClient,
  input: QuoteMethodsInput,
): Promise<{ options: ShippingQuoteOption[]; rates: RatesResult | null }> {
  const needsLive = input.methods.some((m) => (m.rate_source ?? "flat") === "easyship");
  let rates: RatesResult | null = null;
  let handlingDays = 0;
  if (needsLive) {
    let settings: ShippingSettings | null = null;
    try {
      settings = await input.loadSettings();
    } catch (err) {
      console.error("[shipping] Could not read shipping settings:", err);
      rates = { ok: false, reason: "error", message: "Shipping settings could not be read" };
    }
    if (settings) {
      handlingDays = settings.handling_days;
      const currency = input.methods.find((m) => m.rate_source === "easyship")?.currency ?? "SGD";
      rates = await fetchCourierRates(admin, {
        settings,
        destination: input.destination,
        parcels: buildParcels(input.lines, settings.packages),
        currency,
        config: input.config,
        fetchImpl: input.fetchImpl,
      });
    }
  }
  const options = input.methods
    .map((m) => priceMethod(m, rates, input.subtotal, handlingDays))
    .filter((o): o is ShippingQuoteOption => o !== null);
  return { options, rates };
}
