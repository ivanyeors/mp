import { z } from "zod";
import { usesPostalCode } from "@/lib/shipping/countries";

export const MAX_ADDON_QUANTITY = 20;

export const PreferenceLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(1).default(1),
  category: z.enum(["cover", "case"]),
});

export const AddonLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(MAX_ADDON_QUANTITY).default(1),
});

export const AddressSchema = z
  .object({
    recipient: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().optional().nullable(),
    city: z.string().min(1),
    state: z.string().optional().nullable(),
    postal_code: z.string().trim().default(""),
    country: z.string().length(2).toUpperCase().default("SG"),
  })
  .refine((a) => !usesPostalCode(a.country) || a.postal_code.length > 0, {
    message: "Postal code is required",
    path: ["postal_code"],
  });
