"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PushToProductsDialog } from "@/components/settings/push-to-products-dialog";
import { formatCurrency } from "@/lib/i18n/currencies";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import {
  SHOP_CATEGORY_TITLES,
  costingsHrefFor,
  sizesToPush,
  unsyncedSizes,
  type InventoryFamily,
} from "@/lib/ecommerce/inventory-families";

function detail(family: InventoryFamily): string {
  const pushing = sizesToPush(family.sizes);
  const n = pushing.length;
  const sizes =
    family.push === "partial"
      ? `${n} new size${n === 1 ? "" : "s"} (${pushing.map((s) => s.size).join(", ")})`
      : n === 1
        ? pushing[0]!.size
          ? `Size ${pushing[0]!.size}`
          : "One size"
        : `${n} sizes`;
  const msrps = pushing.map((s) => s.msrpCents).filter((c): c is number => c != null);
  if (msrps.length === 0) return sizes;
  const min = Math.min(...msrps);
  const max = Math.max(...msrps);
  const price = min === max ? formatCurrency(min / 100) : `${formatCurrency(min / 100)} to ${formatCurrency(max / 100)}`;
  return `${sizes}, ${price}`;
}

async function fetchUnpushedFamilies(): Promise<InventoryFamily[]> {
  const res = await fetch("/api/shop/products/from-inventory");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't load inventory.");
  return ((json.rows ?? []) as InventoryFamily[]).filter((f) => f.push !== "pushed");
}

export function InventoryPushSheet({
  open,
  onOpenChange,
  onPushed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPushed?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add from Inventory</SheetTitle>
          <SheetDescription>
            Covers, cases, protectors and accessories in Inventory that aren&apos;t in Products
            yet. Each needs a cost and MSRP in Costings, then a price check.
          </SheetDescription>
        </SheetHeader>
        <PushList onPushed={onPushed} />
      </SheetContent>
    </Sheet>
  );
}

function PushList({ onPushed }: { onPushed?: () => void }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = (href: string) => withLocale(href, locale);

  const [families, setFamilies] = useState<InventoryFamily[] | null>(null);
  const [pushing, setPushing] = useState<InventoryFamily | null>(null);

  const load = useCallback(
    () =>
      fetchUnpushedFamilies()
        .then(setFamilies)
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Couldn't load inventory.");
          setFamilies([]);
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const rows = families ?? [];
  const byCategory = new Map<string, InventoryFamily[]>();
  for (const family of rows) {
    const list = byCategory.get(family.category) ?? [];
    list.push(family);
    byCategory.set(family.category, list);
  }
  const ready = rows.filter((f) => unsyncedSizes(f.category, sizesToPush(f.sizes)).length === 0).length;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {families === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Everything in Inventory is in Products.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs font-medium">
              {ready} of {rows.length} ready to push
            </p>
            {[...byCategory.entries()].map(([category, group]) => (
              <div key={category} className="overflow-hidden rounded-lg border">
                <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {SHOP_CATEGORY_TITLES[category] ?? category}
                </div>
                <ul className="divide-y">
                  {group.map((family) => {
                    const unsynced = unsyncedSizes(family.category, sizesToPush(family.sizes));
                    return (
                      <li key={family.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{family.title}</div>
                          <div className="text-xs text-muted-foreground">{detail(family)}</div>
                          {unsynced.length > 0 ? (
                            <div className="text-xs text-amber-700 dark:text-amber-300">
                              {unsynced.length === 1 && sizesToPush(family.sizes).length === 1
                                ? "Needs a cost and MSRP in Costings"
                                : `${unsynced.length} size${unsynced.length === 1 ? " needs" : "s need"} a cost and MSRP in Costings`}
                            </div>
                          ) : null}
                        </div>
                        {unsynced.length > 0 ? (
                          <Button asChild size="sm" variant="outline" className="shrink-0">
                            <Link
                              href={to(costingsHrefFor(unsynced.map((s) => s.itemId)))}
                              aria-label={`Add cost for ${family.title} in Costings`}
                            >
                              <CircleDollarSign className="mr-1.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                              Add cost
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="shrink-0"
                            onClick={() => setPushing(family)}
                            aria-label={`Push ${family.title} to Products`}
                          >
                            <PackagePlus className="mr-1.5 h-4 w-4" />
                            {family.push === "partial" ? "Add sizes" : "Push"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <PushToProductsDialog
        family={pushing}
        open={pushing !== null}
        onOpenChange={(next) => {
          if (!next) setPushing(null);
        }}
        onPushed={() => {
          void load();
          onPushed?.();
        }}
      />
    </>
  );
}
