import { unstable_cache } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { EasyshipAddress } from "@/lib/easyship/schema";
import type { PackageType, ShippingSettings } from "@/lib/shipping/types";

export const PACKAGE_TYPES: readonly PackageType[] = ["pillow", "bolster", "accessory"];

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  incoterms: "DDU",
  insure_shipments: false,
  hs_code: "940490",
  item_category: "home_decor",
  handling_days: 0,
  quote_ttl_minutes: 30,
  estimate_declared_value: 150,
};

export const ShippingSettingsSchema = z.object({
  incoterms: z.enum(["DDU", "DDP"]),
  insure_shipments: z.boolean(),
  hs_code: z.string().trim().regex(/^(\d{6,10})?$/, "HS code is 6–10 digits"),
  item_category: z.string().trim().min(1).max(80),
  handling_days: z.number().int().min(0).max(30),
  quote_ttl_minutes: z.number().int().min(5).max(1440),
  estimate_declared_value: z.number().positive().max(100_000),
});

export function parseShippingSettings(row: Record<string, unknown> | null | undefined): ShippingSettings {
  const d = DEFAULT_SHIPPING_SETTINGS;
  if (!row) return { ...d };
  const n = (v: unknown, fallback: number) => {
    const parsed = typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    incoterms: row.incoterms === "DDP" ? "DDP" : "DDU",
    insure_shipments: row.insure_shipments === true,
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

export function missingOriginFields(origin: EasyshipAddress): string[] {
  return REQUIRED_ORIGIN_FIELDS.filter((f) => !String(origin[f] ?? "").trim());
}

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
