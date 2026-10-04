"use server";

import { revalidatePath } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

/**
 * Set a partner's self-purchase rate + unit cap (#82). Staff-only (assertAdmin) —
 * lives beside the Partner Commissions editor, invisible in the Partner Hub.
 * Per-partner ONLY (no DEFAULT): the discount is a partner-specific perk. A zero
 * cap turns the feature off for that partner.
 */
export async function upsertSelfPurchaseRate(formData: FormData): Promise<void> {
  const actor = await assertAdmin("partner-commissions");
  const admin = supabaseAdmin();

  const partnerId = (formData.get("partner_id") as string) || "";
  const kind = formData.get("kind") as string;
  const amount = Number(formData.get("amount"));
  const unitCap = Number(formData.get("unit_cap"));

  if (!partnerId) {
    throw new Error("Partner is required.");
  }
  if (kind !== "flat" && kind !== "percent") {
    throw new Error("Invalid rate kind.");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number.");
  }
  if (!Number.isInteger(unitCap) || unitCap < 0) {
    throw new Error("Unit cap must be a non-negative integer.");
  }

  const { error } = await admin
    .from("partners")
    .update({
      self_purchase_kind: kind,
      self_purchase_amount: amount,
      self_purchase_unit_cap: unitCap,
    })
    .eq("id", partnerId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "partner_self_purchase.upsert",
    entityType: "partner",
    entityId: partnerId,
    before: null,
    after: { self_purchase_kind: kind, self_purchase_amount: amount, self_purchase_unit_cap: unitCap },
  });

  invalidateTag("locations");
  revalidatePath("/settings/partner-commissions");
}
