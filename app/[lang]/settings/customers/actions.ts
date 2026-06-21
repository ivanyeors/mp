"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";

async function requireAuth() {
  await assertAdmin("customers");
}

export async function updateCustomer(
  id: string,
  data: {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    tags?: string[];
    notes?: string;
  },
) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("customers")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/settings/customers");
  return { ok: true, row };
}
