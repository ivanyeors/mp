"use server";

import { revalidatePath } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

/** A typo guard, far above any pool the Schedule would set. */
const MAX_COMMISSION_POOL = 1000;

/**
 * Set one partner's Commission Pool and customer discount (ADR 0034). Staff-only
 * (assertAdmin): the partner sees the pool and picks their share in the Partner
 * Hub, but never sets the pool or the discount. A new pool prices sales held from
 * now on; a Result already held keeps the commission and discount it was held with.
 */
export async function updatePartnerTerms(formData: FormData): Promise<void> {
  const actor = await assertAdmin("partner-commissions");
  const admin = supabaseAdmin();

  const partnerId = String(formData.get("partner_id") ?? "");
  const pool = Number(formData.get("commission_pool"));
  const customerDiscount = formData.get("customer_discount") === "on";

  if (!partnerId) throw new Error("Partner is required.");
  if (!Number.isFinite(pool) || pool < 0 || pool > MAX_COMMISSION_POOL) {
    throw new Error(`The Commission Pool must be between S$0 and S$${MAX_COMMISSION_POOL}.`);
  }

  const { data: before, error: readError } = await admin
    .from("partners")
    .select("commission_pool, customer_discount_enabled")
    .eq("id", partnerId)
    .eq("type", "partner")
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Partner not found.");

  const after = { commission_pool: Math.round(pool * 100) / 100, customer_discount_enabled: customerDiscount };
  const { error } = await admin.from("partners").update(after).eq("id", partnerId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "partner_terms.update",
    entityType: "partner",
    entityId: partnerId,
    before,
    after,
  });

  invalidateTag("locations");
  revalidatePath("/settings/partner-commissions");
}
