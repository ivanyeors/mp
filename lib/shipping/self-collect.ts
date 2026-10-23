import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AddressSchema } from "@/lib/results/finish-schemas";

/**
 * Self-collect (CONTEXT.md): a shipping method whose `collect_location_id`
 * names the studio the customer collects from. No courier, no address to type —
 * the shipping address a Result and its Order carry is that studio's, with the
 * customer as recipient, so every reader that treats "has an address" as
 * "finished" and "not handed over at the counter" keeps working unchanged.
 */

/** Read as "not self-collect" on a row read before the column existed. */
export function isSelfCollect(method: { collect_location_id?: string | null }): boolean {
  return Boolean(method.collect_location_id);
}

/** The marker a self-collect address carries, which the Order inherits at accept. */
export type CollectLocationMarker = { id: string; name: string };

/** True for the shipping address of a self-collect Result or Order. */
export function isSelfCollectAddress(address: unknown): boolean {
  return Boolean(
    address &&
      typeof address === "object" &&
      (address as { collect_location?: unknown }).collect_location,
  );
}

export function collectLocationOf(address: unknown): CollectLocationMarker | null {
  if (!isSelfCollectAddress(address)) return null;
  const marker = (address as { collect_location: Partial<CollectLocationMarker> }).collect_location;
  return marker.id && marker.name ? { id: marker.id, name: marker.name } : null;
}

/**
 * What the configurator sends. A delivery method validates it as a full
 * address once the method is known; a self-collect method reads the recipient
 * alone, so the hidden address fields may arrive empty.
 */
export const ShippingAddressInputSchema = z.object({
  recipient: z.string().trim().min(1),
  line1: z.string().optional(),
  line2: z.string().optional().nullable(),
  city: z.string().optional(),
  state: z.string().optional().nullable(),
  postal_code: z.string().optional(),
  country: z.string().length(2).default("SG"),
});
export type ShippingAddressInput = z.infer<typeof ShippingAddressInputSchema>;

type CollectLocation = { id: string; name: string; address: string | null; postal_code: string | null };

/**
 * The address a studio is collected from. Locations hold one free-text address
 * line and a postal code, and every own studio is in Singapore.
 */
export function collectionAddress(location: CollectLocation, recipient: string) {
  return {
    recipient,
    line1: location.address ?? "",
    line2: null,
    city: "Singapore",
    state: null,
    postal_code: location.postal_code ?? "",
    country: "SG",
    collect_location: { id: location.id, name: location.name } satisfies CollectLocationMarker,
  };
}

export type ResolvedShippingAddress = Record<string, unknown> & { country: string };

/**
 * The shipping address to store for a chosen method: the typed address for a
 * delivery method, the studio's for a self-collect one. Shared by the hold, the
 * finish and the Staff re-configure, so the three cannot disagree.
 */
export async function resolveShippingAddress(
  admin: SupabaseClient,
  method: { collect_location_id?: string | null },
  input: ShippingAddressInput,
): Promise<{ ok: true; address: ResolvedShippingAddress } | { ok: false; status: number; error: unknown }> {
  if (!isSelfCollect(method)) {
    const parsed = AddressSchema.safeParse(input);
    if (!parsed.success) return { ok: false, status: 400, error: parsed.error.flatten() };
    return { ok: true, address: parsed.data };
  }
  const { data: location, error } = await admin
    .from("partners")
    .select("id, name, address, postal_code")
    .eq("id", method.collect_location_id!)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!location || !(location as CollectLocation).address?.trim()) {
    return { ok: false, status: 409, error: "This collection point is not available. Choose another shipping method." };
  }
  return { ok: true, address: collectionAddress(location as CollectLocation, input.recipient) };
}
