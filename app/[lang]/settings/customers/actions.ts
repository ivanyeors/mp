"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";

/** Every action here changes a Customer, so each needs `customers-edit` (CRM slice 10). */
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
  await assertAdmin("customers-edit");
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
