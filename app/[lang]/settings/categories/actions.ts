"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateSession, SETTINGS_SESSION_COOKIE } from "@/lib/settings-auth";
import { cookies } from "next/headers";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SETTINGS_SESSION_COOKIE)?.value;
  const result = validateSession(token);
  if (!result.valid) throw new Error("Unauthorized");
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
