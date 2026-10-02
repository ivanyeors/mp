"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { blogPostUrls, pingIndexNow } from "@/lib/seo/indexnow";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";

async function requireAuth() {
  await assertAdmin("blogs");
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
  if (data?.slug && status !== "draft") after(() => pingIndexNow(blogPostUrls(data.slug as string)));
  return { ok: true, row: data };
}
