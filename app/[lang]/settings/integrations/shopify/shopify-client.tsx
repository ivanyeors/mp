"use client";

import { useState } from "react";
import ShopifyAdminPanel from "../../inventory/ShopifyAdminPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fullShopifySync } from "../../inventory/actions";

export type Item = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
};

export type ShopifyInitialData = Item[];

export default function ShopifyAdminPage({
  initialData,
}: {
  initialData: ShopifyInitialData;
}) {
  const [syncingShopify, setSyncingShopify] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
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
      <ShopifyAdminPanel items={initialData} />
    </div>
  );
}
