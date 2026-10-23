import { z } from "zod";
import { usesPostalCode } from "@/lib/shipping/countries";

/**
 * The customer's finish — cover/case, add-ons, shipping. Shared by the hold
 * submit and the post-assignment finish route (ADR 0017) so the two accept
 * exactly the same shapes.
 */

export const PreferenceLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive().default(1),
  category: z.enum(["cover", "case"]),
});

export const AddonLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive().default(1),
});

/** A delivery address. The postal code may be blank only where the country has none (Hong Kong, the UAE…). */
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
