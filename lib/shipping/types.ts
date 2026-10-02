import type { ProductType, ShippingMethod } from "@/lib/types/ecommerce";

/** How a product type is boxed for a courier. One profile per type (ADR 0020). */
export type PackageType = "pillow" | "bolster" | "accessory";

export interface PackageProfile {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  /** Packed weight of one unit; a variant's own weight_grams wins when set. */
  weight_grams: number;
}

/** Where parcels leave from. Field names follow Easyship's address shape. */
export interface ShippingOriginAddress {
  contact_name: string;
  company_name?: string;
  contact_phone: string;
  contact_email: string;
  line_1: string;
  line_2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country_alpha2: string;
}

export interface ShippingSettings {
  easyship_enabled: boolean;
  origin_address: Partial<ShippingOriginAddress>;
  packages: Record<PackageType, PackageProfile>;
  /** DDU: the receiver pays any duties. DDP: duties are quoted into the rate. */
  incoterms: "DDU" | "DDP";
  insure_shipments: boolean;
  hs_code: string;
  item_category: string;
  /** Business days added to courier transit times before they are shown. */
  handling_days: number;
  quote_ttl_minutes: number;
  /** Per-unit declared value for quotes made without a cart (the estimator). */
  estimate_declared_value: number;
}

/** One cart or order line, reduced to what a courier prices. Built server-side only. */
export interface ShippableLine {
  product_type: ProductType;
  quantity: number;
  /** The variant's weight; null falls back to the package profile. */
  weight_grams: number | null;
  /** Per-unit declared value (customs and insurance). */
  unit_value: number;
  currency: string;
  description: string;
  sku?: string | null;
}

export interface ParcelItem {
  description: string;
  sku?: string | null;
  quantity: number;
  /** Per unit. */
  weight_kg: number;
  /** Per unit. */
  declared_value: number;
  currency: string;
}

export interface Parcel {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  items: ParcelItem[];
}

export interface ShippingDestination {
  country: string;
  postal_code: string;
  city?: string | null;
  state?: string | null;
  line1?: string | null;
  line2?: string | null;
}

/** One courier service's live price, normalised from an Easyship rate. */
export interface CourierRate {
  courier_service_id: string;
  courier_name: string;
  umbrella_name: string | null;
  total_charge: number;
  currency: string;
  min_days: number | null;
  max_days: number | null;
  cost_rank: number | null;
  delivery_time_rank: number | null;
  value_for_money_rank: number | null;
}

/** Why live rates could not be used; every reason except "no_rates" falls back to base_rate. */
export type RatesFailure =
  | "not_configured"
  | "disabled"
  | "invalid_origin"
  | "too_many_parcels"
  | "error";

export type RatesResult =
  | { ok: true; rates: CourierRate[]; quoteId: string | null; cached: boolean }
  | { ok: false; reason: RatesFailure; message: string };

/** A shipping method priced for one cart and address. */
export interface ShippingQuoteOption {
  method: ShippingMethod;
  /** What the shopper pays, after free_above. */
  amount: number;
  is_free: boolean;
  currency: string;
  /** flat = base_rate; easyship = live rate; fallback = base_rate because live rates failed. */
  source: "flat" | "easyship" | "fallback";
  courier: { service_id: string; name: string; umbrella_name: string | null } | null;
  /** What the courier charges us, before markup. Easyship only. */
  carrier_cost: number | null;
  /** Transit plus handling days; null when unknown. */
  min_days: number | null;
  max_days: number | null;
}

/** One option as the public quote endpoint returns it. What the courier costs us is never in it. */
export interface ShippingQuoteOptionView {
  method_id: string;
  slug: string;
  content: ShippingMethod["content"];
  currency: string;
  /** Before free_above: the client applies the threshold to its own subtotal; the checkout route re-prices. */
  price: number;
  free_above: number | null;
  source: "flat" | "easyship" | "fallback";
  courier: { name: string; umbrella_name: string | null } | null;
  min_days: number | null;
  max_days: number | null;
}

export interface ShippingQuoteResponse {
  ok: true;
  /** False when live rates were wanted but unavailable, so live methods show their flat fallback. */
  live: boolean;
  options: ShippingQuoteOptionView[];
}
