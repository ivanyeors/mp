import { supabaseAdmin } from "@/lib/supabase/server";

export type ShopifyAdminItem = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
};

export async function listShopifyAdminItems(): Promise<ShopifyAdminItem[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("items")
    .select("id,category,subtype,name,size,alteration_of_item_id")
    .eq("is_active", true);
  return (data ?? []) as ShopifyAdminItem[];
}
