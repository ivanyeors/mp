"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateSession, SETTINGS_SESSION_COOKIE } from "@/lib/settings-auth";
import { cookies } from "next/headers";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SETTINGS_SESSION_COOKIE)?.value;
  const result = validateSession(token);
  if (!result.valid) throw new Error("Unauthorized");
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
