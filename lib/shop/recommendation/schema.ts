import { z } from "zod";
import type { CustomizationResult } from "@/lib/types/customization";

/**
 * Schema describing the shape of a recommendation result. The optional model
 * endpoint must return something matching this; anything else is rejected and
 * the engine falls back to the rule-based recommendation.
 */
const fillingLineSchema = z.object({
  item_id: z.number(),
  subtype: z.string(),
  name: z.string(),
  quantity: z.number(),
});

export const customizationResultSchema = z.object({
  recommended_size: z.string().min(1),
  recommended_kind: z.string().min(1),
  filling_lines: z.array(fillingLineSchema),
  summary: z.string(),
  explanation: z.string(),
});

/**
 * Validate an untrusted model response. Returns the typed result on success,
 * or null when the shape is invalid (signalling the caller to fall back).
 */
export function parseModelResult(data: unknown): CustomizationResult | null {
  const result = customizationResultSchema.safeParse(data);
  return result.success ? (result.data as CustomizationResult) : null;
}
