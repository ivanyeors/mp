import { z } from "zod";

export const LiveRateFields = {
  rate_source: z.enum(["flat", "easyship"]).optional(),
  easyship_strategy: z.enum(["cheapest", "fastest", "best_value", "courier"]).optional(),
  easyship_courier_service_id: z.string().trim().max(200).nullable().optional(),
  markup_percent: z.number().min(-100).max(500).optional(),
  markup_fixed: z.number().min(-1000).max(1000).optional(),
  rate_rounding: z.number().min(0).max(100).optional(),
};

export const CountriesField = z
  .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use two-letter country codes"))
  .min(1, "Choose at least one country")
  .max(300);

export function courierPinned(body: {
  easyship_strategy?: string;
  easyship_courier_service_id?: string | null;
}): boolean {
  return body.easyship_strategy !== "courier" || Boolean(body.easyship_courier_service_id?.trim());
}

export const COURIER_PIN_ERROR = {
  message: "Choose the courier service to pin, or pick another strategy",
  path: ["easyship_courier_service_id"],
};

export const SelfCollectFields = {
  collect_location_id: z.string().uuid().nullable().optional(),
};

export function collectIsFlat(body: { rate_source?: string; collect_location_id?: string | null }): boolean {
  return !body.collect_location_id || body.rate_source !== "easyship";
}

export const COLLECT_FLAT_ERROR = {
  message: "A self-collect method charges a flat rate: set the rate source to Flat",
  path: ["rate_source"],
};
