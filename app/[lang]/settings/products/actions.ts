"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncAllProducts } from "@/lib/ecommerce/inventory-sync";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

function requireAuth() {
  return assertAdmin("products");
}

export async function deleteProduct(id: string) {
  const actor = await requireAuth();
  const admin = supabaseAdmin();

  const { data: before } = await admin
    .from("products")
    .select("id, slug, status, product_type")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "product.delete",
    entityType: "product",
    entityId: id,
    before,
  });

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
  const created = result.pillows.created + result.bolsters.created;
  const updated = result.pillows.updated + result.bolsters.updated;
  const parts = [`${created} created`, `${updated} updated`];
  if (result.items.archived) parts.push(`${result.items.archived} archived`);
  if (result.items.adopted) parts.push(`${result.items.adopted} adopted`);
  if (result.items.legacy) parts.push(`${result.items.legacy} legacy`);
  return { ok: true, message: `Synced: ${parts.join(", ")}` };
}
