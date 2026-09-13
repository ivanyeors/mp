"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/i18n/currencies";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import type { ShopListingFamily } from "@/lib/ecommerce/shop-listings";

const CATEGORY_TITLES: Record<string, string> = {
  accessories: "Accessories",
  cover: "Covers",
  pillow_case: "Pillow Cases",
  pillow_protector: "Pillow Protectors",
  bolster_case: "Bolster Cases",
  bolster_protector: "Bolster Protectors",
};

function priceLabel(family: ShopListingFamily): string {
  if (family.msrpMin == null) return "No MSRP";
  if (family.msrpMax == null || family.msrpMin === family.msrpMax) {
    return formatCurrency(family.msrpMin);
  }
  return `${formatCurrency(family.msrpMin)} – ${formatCurrency(family.msrpMax)}`;
}

/**
 * Inventory that can be sold on its own, one row per storefront product. Sizes
 * are variants of one listing, so "Cervical Neck Support" is a single row with
 * a single switch — not four.
 */
export function ShopListingToggles() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = useCallback((p: string) => withLocale(p, locale), [locale]);

  const [families, setFamilies] = useState<ShopListingFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shop/products/accessory-listings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load inventory");
      setFamilies(json.rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load inventory");
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (family: ShopListingFamily, listed: boolean) => {
    setPendingKey(family.key);
    // Optimistic: the switch should not lag behind the thumb.
    setFamilies((prev) =>
      prev.map((f) => (f.key === family.key ? { ...f, listed } : f)),
    );
    try {
      const res = await fetch("/api/shop/products/accessory-listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: family.itemIds, listed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      toast.success(listed ? `${family.title} is now in the shop` : `${family.title} removed from the shop`);
      // A publish mints a product id and slug, so re-read rather than guess.
      if (json.action === "publish") void load();
    } catch (err) {
      setFamilies((prev) =>
        prev.map((f) => (f.key === family.key ? { ...f, listed: !listed } : f)),
      );
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPendingKey(null);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? families.filter(
        (f) => f.title.toLowerCase().includes(q) || f.category.toLowerCase().includes(q),
      )
    : families;

  const byCategory = new Map<string, ShopListingFamily[]>();
  for (const family of visible) {
    const list = byCategory.get(family.category) ?? [];
    list.push(family);
    byCategory.set(family.category, list);
  }

  const listedCount = families.filter((f) => f.listed).length;

  return (
    <div className="rounded-xl border">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Sell from inventory</h3>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading inventory…"
              : `${listedCount} of ${families.length} in the shop. Prices come from Costings.`}
          </p>
        </div>
        <Input
          placeholder="Search inventory…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-64"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {families.length === 0
            ? "No sellable inventory found."
            : "Nothing matches your search."}
        </div>
      ) : (
        [...byCategory.entries()].map(([category, rows]) => (
          <div key={category}>
            <div className="bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {CATEGORY_TITLES[category] ?? category}
            </div>
            <ul className="divide-y">
              {rows.map((family) => (
                <li
                  key={family.key}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{family.title}</span>
                      {family.slug && (
                        <Link
                          href={to(`/settings/products/${family.productId}`)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Edit ${family.title}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {family.sizes.length > 0 && `${family.sizes.length} sizes · `}
                      {priceLabel(family)}
                      {!family.priced && " · set an MSRP in Costings to sell this"}
                    </div>
                  </div>
                  <Switch
                    checked={family.listed}
                    disabled={pendingKey === family.key || (!family.priced && !family.listed)}
                    onCheckedChange={(checked) => void toggle(family, checked)}
                    aria-label={`Sell ${family.title} in the shop`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
