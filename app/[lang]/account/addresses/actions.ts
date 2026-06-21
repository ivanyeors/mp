"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import {
  AddressInputSchema,
  getCurrentCustomerId,
} from "@/lib/shop/customer-addresses";

export type AddressActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/[lang]/account/addresses", "page");
}

/** Clears the default flag on every other address owned by the customer. */
async function clearDefaults(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  customerId: string,
  exceptId?: string,
) {
  let query = supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("customer_id", customerId)
    .eq("is_default", true);
  if (exceptId) query = query.neq("id", exceptId);
  await query;
}

export async function createAddress(input: unknown): Promise<AddressActionResult> {
  const parsed = AddressInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid address" };
  }

  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };

  const supabase = await createSupabaseServerClient();

  // Unset any existing default first so the one-default-per-customer index holds.
  if (parsed.data.is_default) await clearDefaults(supabase, customerId);

  const { error } = await supabase
    .from("customer_addresses")
    .insert({ ...parsed.data, customer_id: customerId });

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateAddress(
  id: string,
  input: unknown,
): Promise<AddressActionResult> {
  const parsed = AddressInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid address" };
  }

  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };

  const supabase = await createSupabaseServerClient();

  if (parsed.data.is_default) await clearDefaults(supabase, customerId, id);

  // RLS scopes the update to the customer's own rows; the id filter is belt-and-braces.
  const { error } = await supabase
    .from("customer_addresses")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function setDefaultAddress(id: string): Promise<AddressActionResult> {
  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };

  const supabase = await createSupabaseServerClient();
  await clearDefaults(supabase, customerId, id);

  const { error } = await supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteAddress(id: string): Promise<AddressActionResult> {
  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };

  const supabase = await createSupabaseServerClient();

  const { data: removed, error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", id)
    .select("is_default")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  // If the deleted address was the default, promote the most recent remaining
  // one so the customer keeps a usable default at checkout.
  if (removed?.is_default) {
    const { data: next } = await supabase
      .from("customer_addresses")
      .select("id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", next.id);
    }
  }

  revalidate();
  return { ok: true };
}
