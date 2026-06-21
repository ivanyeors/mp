"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";

async function requireAuth() {
  await assertAdmin("discounts");
}

export async function deleteCoupon(id: string) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { error } = await admin.from("coupons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/discounts");
  return { ok: true };
}

export async function toggleCouponActive(id: string, isActive: boolean) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("coupons")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/settings/discounts");
  return { ok: true, row: data };
}
