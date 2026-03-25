import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProductCategory } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

export async function getCategoryTree(): Promise<ProductCategory[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("categories")
    .select("*")
    .order("position", { ascending: true });

  if (error) return [];
  const categories = (data ?? []) as ProductCategory[];

  // Build tree from flat list
  const map = new Map<string, ProductCategory>();
  const roots: ProductCategory[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getAllCategories(): Promise<ProductCategory[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("categories")
    .select("*")
    .order("position", { ascending: true });

  if (error) return [];
  return (data ?? []) as ProductCategory[];
}

export async function getCategoryBySlug(slug: string): Promise<ProductCategory | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data as ProductCategory;
}

export function resolveCategoryContent(category: ProductCategory, locale: Locale = DEFAULT_LOCALE) {
  const content = category.content[locale] ?? category.content[DEFAULT_LOCALE] ?? Object.values(category.content)[0];
  return content ?? { name: category.slug, description: "" };
}
