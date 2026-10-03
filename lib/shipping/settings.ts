import { unstable_cache } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PackageType, ShippingOriginAddress, ShippingSettings } from "@/lib/shipping/types";

export const PACKAGE_TYPES: readonly PackageType[] = ["pillow", "bolster", "accessory"];

/** Mirrors the column defaults in 20261002090000_easyship_shipping.sql. */
export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  easyship_enabled: false,
  origin_address: {},
  incoterms: "DDU",
  insure_shipments: false,
  hs_code: "940490",
  item_category: "home_decor",
  handling_days: 0,
  quote_ttl_minutes: 30,
  estimate_declared_value: 150,
};

const PackageProfileSchema = z.object({
  length_cm: z.number().positive().max(300),
  width_cm: z.number().positive().max(300),
  height_cm: z.number().positive().max(300),
  weight_grams: z.number().int().positive().max(70_000),
});

const OriginAddressSchema = z.object({
  contact_name: z.string().trim().max(120).default(""),
  company_name: z.string().trim().max(120).optional(),
  contact_phone: z.string().trim().max(40).default(""),
  contact_email: z.string().trim().max(200).default(""),
  line_1: z.string().trim().max(200).default(""),
  line_2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).default(""),
  state: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(20).default(""),
  country_alpha2: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .default("SG"),
});

/** The body Settings → Shipping saves. Every field is required so a save is a whole state. */
export const ShippingSettingsSchema = z.object({
  easyship_enabled: z.boolean(),
  origin_address: OriginAddressSchema,
  // ponytail: no longer read (boxes come from the courier account); slice 05 drops it
  packages: z
    .object({ pillow: PackageProfileSchema, bolster: PackageProfileSchema, accessory: PackageProfileSchema })
    .optional(),
  incoterms: z.enum(["DDU", "DDP"]),
  insure_shipments: z.boolean(),
  /** Empty: classify by item_category instead. */
  hs_code: z.string().trim().regex(/^(\d{6,10})?$/, "HS code is 6–10 digits"),
  item_category: z.string().trim().min(1).max(80),
  handling_days: z.number().int().min(0).max(30),
  quote_ttl_minutes: z.number().int().min(5).max(1440),
  estimate_declared_value: z.number().positive().max(100_000),
});

/** A stored row (or nothing) as complete settings: anything missing or malformed takes its default. */
export function parseShippingSettings(row: Record<string, unknown> | null | undefined): ShippingSettings {
  const d = DEFAULT_SHIPPING_SETTINGS;
  if (!row) return { ...d };
  const n = (v: unknown, fallback: number) => {
    const parsed = typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    easyship_enabled: row.easyship_enabled === true,
    origin_address:
      row.origin_address && typeof row.origin_address === "object"
        ? (row.origin_address as Partial<ShippingOriginAddress>)
        : {},
    incoterms: row.incoterms === "DDP" ? "DDP" : "DDU",
    insure_shipments: row.insure_shipments === true,
    // An empty HS code is a choice (classify by category), not a missing value.
    hs_code: typeof row.hs_code === "string" ? row.hs_code : d.hs_code,
    item_category: typeof row.item_category === "string" && row.item_category ? row.item_category : d.item_category,
    handling_days: n(row.handling_days, d.handling_days),
    quote_ttl_minutes: n(row.quote_ttl_minutes, d.quote_ttl_minutes),
    estimate_declared_value: n(row.estimate_declared_value, d.estimate_declared_value),
  };
}

const REQUIRED_ORIGIN_FIELDS = [
  "contact_name",
  "contact_phone",
  "contact_email",
  "line_1",
  "city",
  "postal_code",
  "country_alpha2",
] as const;

/** The origin fields still empty; Easyship needs all of them to quote or ship. */
export function missingOriginFields(origin: Partial<ShippingOriginAddress>): string[] {
  return REQUIRED_ORIGIN_FIELDS.filter((f) => !String(origin[f] ?? "").trim());
}

/**
 * Read on every live quote; edited rarely. Cached behind the `shipping-settings`
 * tag, which the settings PUT invalidates. A failed read throws so a database
 * blip is never mistaken for "Easyship disabled".
 */
export const readShippingSettings = unstable_cache(
  async (): Promise<ShippingSettings> => {
    const { data, error } = await supabaseAdmin()
      .from("shipping_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return parseShippingSettings(data as Record<string, unknown> | null);
  },
  ["shipping-settings"],
  { tags: ["shipping-settings"], revalidate: 300 },
);
