import { supabaseAdmin } from "@/lib/supabase/server";

/** The Item columns the Shopify Link panel renders. */
export type ShopifyAdminItem = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
};

/**
 * Server-side twin of the Shopify Link page's browser query: every active Item,
 * same columns, same (absent) ordering — so the server render and a later
 * client refresh produce the same list.
 */
export async function listShopifyAdminItems(): Promise<ShopifyAdminItem[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("items")
    .select("id,category,subtype,name,size,alteration_of_item_id")
    .eq("is_active", true);
  return (data ?? []) as ShopifyAdminItem[];
}
