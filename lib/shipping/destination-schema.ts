import { z } from "zod";
import { usesPostalCode } from "@/lib/shipping/countries";

/**
 * Where a quote is for. The postal code may be left blank only where the country
 * has none in general use (Hong Kong, the UAE…); everywhere else couriers price
 * by it, so it is required.
 */
export const QuoteDestinationSchema = z
  .object({
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    postal_code: z.string().trim().max(12).regex(/^[A-Za-z0-9 -]*$/).default(""),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    line1: z.string().trim().max(200).optional(),
  })
  .refine((d) => !usesPostalCode(d.country) || d.postal_code.length >= 2, {
    message: "A postal code is required for this country",
    path: ["postal_code"],
  });
