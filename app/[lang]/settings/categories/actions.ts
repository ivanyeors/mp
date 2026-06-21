"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";

async function requireAuth() {
  await assertAdmin("categories");
}

export async function deleteCategory(id: string) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { error } = await admin.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateTag("categories");
  revalidatePath("/settings/categories");
  return { ok: true };
}

export async function reorderCategories(positions: { id: string; position: number }[]) {
  await requireAuth();
  const admin = supabaseAdmin();
  await Promise.all(
    positions.map(({ id, position }) =>
      admin.from("categories").update({ position }).eq("id", id)
    )
  );
  revalidateTag("categories");
  revalidatePath("/settings/categories");
  return { ok: true };
}
