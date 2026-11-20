import { z } from "zod";
import type { CustomizationResult } from "@/lib/types/customization";

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

export function parseModelResult(data: unknown): CustomizationResult | null {
  const result = customizationResultSchema.safeParse(data);
  return result.success ? (result.data as CustomizationResult) : null;
}
