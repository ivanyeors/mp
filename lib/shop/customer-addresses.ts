import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import type { CustomerAddress } from "@/lib/types/ecommerce";

/**
 * Customer-facing saved-address reads and validation.
 *
 * Everything runs through the cookie-based (anon/SSR) Supabase client so each
 * query is evaluated under the signed-in shopper's RLS context. The policies in
 * migration 0040 ensure a customer only ever sees and mutates their own
 * addresses — there is no application-level customer filter here on purpose.
 */

export const AddressInputSchema = z.object({
  label: z.string().trim().max(60).optional(),
  recipient: z.string().trim().min(1, "Recipient is required").max(120),
  line1: z.string().trim().min(1, "Address is required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, "City is required").max(120),
  state: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().min(1, "Postal code is required").max(20),
  country: z.string().trim().length(2, "Use a 2-letter country code").default("MY"),
  phone: z.string().trim().max(40).optional(),
  is_default: z.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof AddressInputSchema>;

/** Resolve the signed-in shopper's customer id, or null when not linked yet. */
export async function getCurrentCustomerId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

/** All saved addresses for the signed-in customer, default first. */
export async function getCustomerAddresses(): Promise<CustomerAddress[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load addresses: ${error.message}`);
  return (data ?? []) as CustomerAddress[];
}
