"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

/**
 * Upsert a commission scheme (#77). Staff-only (assertAdmin) — the scheme editor
 * is invisible in the Partner Hub. An empty partner = the DEFAULT scheme; a partner
 * id = a per-partner override. One scheme per (partner, product_type).
 */
export async function upsertCommissionScheme(formData: FormData): Promise<void> {
  const actor = await assertAdmin("page-builder");
  const admin = supabaseAdmin();

  const partnerId = (formData.get("partner_id") as string) || null;
  const productType = formData.get("product_type") as string;
  const kind = formData.get("kind") as string;
  const amount = Number(formData.get("amount"));

  if (productType !== "pillow" && productType !== "bolster") {
    throw new Error("Invalid product type.");
  }
  if (kind !== "flat" && kind !== "percent") {
    throw new Error("Invalid scheme kind.");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number.");
  }

  // Manual null-safe upsert: the unique index is on coalesce(partner_id, sentinel),
  // so match on the null-aware key then update or insert.
  let existingQ = admin
    .from("commission_schemes")
    .select("id")
    .eq("product_type", productType);
  existingQ = partnerId ? existingQ.eq("partner_id", partnerId) : existingQ.is("partner_id", null);
  const { data: existing } = await existingQ.maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("commission_schemes")
      .update({ kind, amount })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("commission_schemes")
      .insert({ partner_id: partnerId, product_type: productType, kind, amount });
    if (error) throw new Error(error.message);
  }

  await recordAdminAction({
    actor,
    action: "commission_scheme.upsert",
    entityType: "commission_scheme",
    entityId: partnerId ?? "default",
    before: null,
    after: { partner_id: partnerId, product_type: productType, kind, amount },
  });

  revalidatePath("/settings/partner-commissions");
}
