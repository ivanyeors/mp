import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AddressSchema } from "@/lib/results/finish-schemas";

export function isSelfCollect(method: { collect_location_id?: string | null }): boolean {
  return Boolean(method.collect_location_id);
}

export type CollectLocationMarker = { id: string; name: string };

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

export function methodDeliversTo(method: { countries?: string[] | null }, country: string): boolean {
  const countries = method.countries ?? [];
  return countries.length === 0 || countries.includes(country.toUpperCase());
}

export async function resolveShippingAddress(
  admin: SupabaseClient,
  method: { collect_location_id?: string | null; countries?: string[] | null },
  input: ShippingAddressInput,
): Promise<{ ok: true; address: ResolvedShippingAddress } | { ok: false; status: number; error: unknown }> {
  if (!isSelfCollect(method)) {
    const parsed = AddressSchema.safeParse(input);
    if (!parsed.success) return { ok: false, status: 400, error: parsed.error.flatten() };
    if (!methodDeliversTo(method, parsed.data.country)) {
      return { ok: false, status: 400, error: "This shipping method does not deliver to the selected country" };
    }
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
