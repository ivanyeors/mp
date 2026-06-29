"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import ShopifyAdminPanel from "../../inventory/ShopifyAdminPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fullShopifySync } from "../../inventory/actions";

type Item = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
};

export default function ShopifyAdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingShopify, setSyncingShopify] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabaseClient
      .from("items")
      .select("id,category,subtype,name,size,alteration_of_item_id")
      .eq("is_active", true);
    setItems((data ?? []) as Item[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          disabled={syncingShopify}
          onClick={async () => {
            if (syncingShopify) return;
            setSyncingShopify(true);
            try {
              const res = await fullShopifySync();
              if (!res?.ok) throw new Error("Sync failed");
              const invUpdated = (res.inventory as { updated?: number } | undefined)?.updated ?? 0;
              const priceUpdated = (res.prices as { updated?: number } | undefined)?.updated ?? 0;
              toast.success(`Shopify synced (inventory ${invUpdated}, prices ${priceUpdated})`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Shopify sync failed");
            } finally {
              setSyncingShopify(false);
            }
          }}
        >
          {syncingShopify ? "Syncing Shopify…" : "Sync Shopify"}
        </Button>
      </div>
      <ShopifyAdminPanel items={items} />
    </div>
  );
}
