import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Shipping methods change rarely and are read on every storefront cart/checkout
 * render. The service-role read is cached per (includeInactive, country) and
 * invalidated by the `shipping-methods` tag; the cookie-based admin check that
 * decides `canIncludeInactive` stays outside the cache.
 */
export const readShippingMethods = unstable_cache(
  async (canIncludeInactive: boolean, country: string | null) => {
    const admin = supabaseAdmin();

    let query = admin.from("shipping_methods").select("*").order("position", { ascending: true });

    if (!canIncludeInactive) {
      query = query.eq("is_active", true);
    }

    if (country) {
      query = query.contains("countries", [country]);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["shipping-methods-list"],
  { tags: ["shipping-methods"], revalidate: 300 },
);
