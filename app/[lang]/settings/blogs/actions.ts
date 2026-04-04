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

export async function deleteBlog(id: string) {
  await requireAuth();
  const admin = supabaseAdmin();
  const { error } = await admin.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/blogs");
  return { ok: true };
}

export async function updateBlogStatus(id: string, status: "draft" | "published" | "unpublished") {
  await requireAuth();
  const admin = supabaseAdmin();

  const updates: Record<string, unknown> = { status };
  if (status === "published") updates.published_at = new Date().toISOString();

  const { data, error } = await admin
    .from("blog_posts")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/settings/blogs");
  return { ok: true, row: data };
}
