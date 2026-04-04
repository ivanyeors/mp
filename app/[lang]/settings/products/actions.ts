"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateSession, SETTINGS_SESSION_COOKIE } from "@/lib/settings-auth";
import { syncAllProducts } from "@/lib/ecommerce/inventory-sync";
import { cookies } from "next/headers";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SETTINGS_SESSION_COOKIE)?.value;
  const result = validateSession(token);
  if (!result.valid) throw new Error("Unauthorized");
}

export async function deleteProduct(id: string) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/products");
  return { ok: true };
}

export async function deleteProducts(ids: string[]) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { error } = await admin.from("products").delete().in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/products");
  return { ok: true };
}

export async function syncProductsFromInventory() {
  await requireAuth();
  const result = await syncAllProducts();
  revalidatePath("/settings/products");
  return {
    ok: true,
    message: `Synced: ${result.pillows.created + result.bolsters.created} created, ${result.pillows.updated + result.bolsters.updated} updated`,
  };
}
