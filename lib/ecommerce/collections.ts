import { supabaseAdmin } from "@/lib/supabase/server";
import type { Collection } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

export async function getCollections(activeOnly = true): Promise<Collection[]> {
  const admin = supabaseAdmin();
  let query = admin.from("collections").select("*").order("position", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Collection[];
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("collections")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data as Collection;
}

export async function getCollectionProductIds(collectionId: string): Promise<string[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("collection_products")
    .select("product_id")
    .eq("collection_id", collectionId)
    .order("position", { ascending: true });

  if (error) return [];
  return (data ?? []).map((row: { product_id: string }) => row.product_id);
}

export function resolveCollectionContent(collection: Collection, locale: Locale = DEFAULT_LOCALE) {
  const content = collection.content[locale] ?? collection.content[DEFAULT_LOCALE] ?? Object.values(collection.content)[0];
  return content ?? { title: collection.slug, description: "" };
}
