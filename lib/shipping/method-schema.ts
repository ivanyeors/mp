import { z } from "zod";

/**
 * The live-rate columns of a shipping method (ADR 0020), shared by the create and
 * update routes. Bounds mirror the table's check constraints so a bad value is a
 * 400 with a message, not a 500 from Postgres.
 */
export const LiveRateFields = {
  rate_source: z.enum(["flat", "easyship"]).optional(),
  easyship_strategy: z.enum(["cheapest", "fastest", "best_value", "courier"]).optional(),
  easyship_courier_service_id: z.string().trim().max(200).nullable().optional(),
  markup_percent: z.number().min(-100).max(500).optional(),
  markup_fixed: z.number().min(-1000).max(1000).optional(),
  rate_rounding: z.number().min(0).max(100).optional(),
};

/** A pinned-courier strategy needs the courier it pins. */
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

/** Customisation orders charge a live method's base_rate (they don't quote couriers), so it can't be free. */
export function livePriced(body: { rate_source?: string; base_rate?: number }): boolean {
  return body.rate_source !== "easyship" || body.base_rate === undefined || body.base_rate > 0;
}

export const LIVE_PRICE_ERROR = {
  message: "Set a customisation order rate above 0 for a live method",
  path: ["base_rate"],
};

/** Self-collect: the studio (own Location) the method is collected from; null = delivered. */
export const SelfCollectFields = {
  collect_location_id: z.string().uuid().nullable().optional(),
};

/** Nothing is couriered when a customer collects, so there is no live rate to quote. */
export function collectIsFlat(body: { rate_source?: string; collect_location_id?: string | null }): boolean {
  return !body.collect_location_id || body.rate_source !== "easyship";
}

export const COLLECT_FLAT_ERROR = {
  message: "A self-collect method charges a flat rate: set the rate source to Flat",
  path: ["rate_source"],
};
