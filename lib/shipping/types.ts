import type { ProductType, ShippingMethod } from "@/lib/types/ecommerce";

export type PackageType = "pillow" | "bolster" | "accessory";

export interface PackageProfile {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_grams: number;
}

export interface TypeBox extends PackageProfile {
  tare_grams: number;
}

export type TypeBoxes = Partial<Record<PackageType, TypeBox>>;

export interface ShippingSettings {
  incoterms: "DDU" | "DDP";
  insure_shipments: boolean;
  hs_code: string;
  item_category: string;
  handling_days: number;
  quote_ttl_minutes: number;
  estimate_declared_value: number;
}

export interface ShippableLine {
  product_type: ProductType;
  quantity: number;
  weight_grams: number | null;
  unit_value: number;
  currency: string;
  description: string;
  sku?: string | null;
}

export interface ParcelItem {
  description: string;
  sku?: string | null;
  quantity: number;
  weight_kg: number;
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

export type RatesFailure =
  | "not_configured"
  | "invalid_origin"
  | "too_many_parcels"
  | "error";

export type RatesResult =
  | { ok: true; rates: CourierRate[]; quoteId: string | null; cached: boolean }
  | { ok: false; reason: RatesFailure; message: string };

export interface ShippingQuoteOption {
  method: ShippingMethod;
  amount: number;
  is_free: boolean;
  currency: string;
  source: "flat" | "easyship";
  courier: { service_id: string; name: string; umbrella_name: string | null } | null;
  carrier_cost: number | null;
  min_days: number | null;
  max_days: number | null;
}

export interface ShippingQuoteOptionView {
  method_id: string;
  slug: string;
  content: ShippingMethod["content"];
  currency: string;
  price: number;
  free_above: number | null;
  source: "flat" | "easyship";
  courier: { name: string; umbrella_name: string | null } | null;
  min_days: number | null;
  max_days: number | null;
}

export interface ShippingQuoteResponse {
  ok: true;
  live: boolean;
  options: ShippingQuoteOptionView[];
}
