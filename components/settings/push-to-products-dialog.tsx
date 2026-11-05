"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CircleDollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/i18n/currencies";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import {
  costingsHrefFor,
  marginPct,
  sizesToPush,
  unsyncedSizes,
  type InventoryFamily,
} from "@/lib/ecommerce/inventory-families";

const money = (cents: number | null) => (cents == null ? "Not set" : formatCurrency(cents / 100));

/**
 * The price check before an inventory family becomes a Storefront product.
 * It shows each size being pushed with its cost, MSRP and margin from
 * Costings, and the push waits until Staff confirm them. A size Costings has
 * not finished holds the push back and points at Costings instead. The server
 * repeats the check against the prices confirmed here, so a price that
 * changed in Costings meanwhile is never published unseen.
 */
export function PushToProductsDialog({
  family,
  open,
  onOpenChange,
  onPushed,
}: {
  family: InventoryFamily | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPushed?: () => void;
}) {
  return (
    <Dialog open={open && family !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted only while open, so the confirmation starts unticked every time. */}
        {family ? <PushForm family={family} onOpenChange={onOpenChange} onPushed={onPushed} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PushForm({
  family,
  onOpenChange,
  onPushed,
}: {
  family: InventoryFamily;
  onOpenChange: (open: boolean) => void;
  onPushed?: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = (href: string) => withLocale(href, locale);
  const router = useRouter();

  const [checked, setChecked] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushingSizes = sizesToPush(family.sizes);
  const unsynced = unsyncedSizes(family.category, pushingSizes);
  const belowCost = pushingSizes.filter(
    (s) => s.costCents != null && s.msrpCents != null && s.msrpCents <= s.costCents,
  );
  const ready = pushingSizes.length > 0 && unsynced.length === 0;
  const adding = family.push === "partial";
  const inShop = family.productStatus === "active";
  const many = pushingSizes.length !== 1;

  const push = async () => {
    setPushing(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/products/from-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: family.sizes.map((s) => s.itemId),
          prices: pushingSizes.map((s) => ({
            item_id: s.itemId,
            cost_cents: s.costCents,
            msrp_cents: s.msrpCents,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A price that moved in Costings means the list on screen is stale.
        if (json.reason === "changed") onPushed?.();
        throw new Error(json.error ?? "Couldn't push to Products.");
      }
      onOpenChange(false);
      onPushed?.();
      if (json.created) {
        toast.success(`${family.title} is in Products as a draft`, {
          description: "Switch it on under Products, In the shop, when it's ready to sell.",
          action: { label: "In the shop", onClick: () => router.push(to("/settings/products?tab=shop")) },
        });
      } else {
        toast.success(
          `${json.added} new size${json.added === 1 ? "" : "s"} added to ${family.title}`,
          inShop ? { description: "It's in the shop, so they're on sale now." } : undefined,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't push to Products.");
    } finally {
      setPushing(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold">
          {adding ? `Add new sizes to ${family.title}` : `Push ${family.title} to Products`}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Check the prices first. Shoppers pay the MSRP from Costings, and every later change in
          Costings updates the product.
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Size</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">MSRP</th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pushingSizes.map((s) => {
              const margin = marginPct(s.costCents, s.msrpCents);
              const loss = margin != null && margin <= 0;
              return (
                <tr key={s.itemId}>
                  <td className="px-3 py-2">{s.size ?? "One size"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", s.costCents == null && "text-amber-600 dark:text-amber-400")}>
                    {money(s.costCents)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", s.msrpCents == null && "text-amber-600 dark:text-amber-400")}>
                    {money(s.msrpCents)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", loss ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {margin == null ? "—" : `${margin}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unsynced.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-2">
            <p>
              {unsynced.length === pushingSizes.length && !many
                ? "Add a cost and MSRP in Costings before this goes to Products."
                : `${unsynced.length} of ${pushingSizes.length} sizes need a cost and MSRP in Costings before this goes to Products.`}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={to(costingsHrefFor(unsynced.map((s) => s.itemId)))}>Add cost in Costings</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {belowCost.length > 0 ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {belowCost.map((s) => s.size ?? "This item").join(", ")}{" "}
                {belowCost.length === 1 ? "sells" : "sell"} at or below cost.
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {adding
              ? inShop
                ? `${family.title} is in the shop, so ${many ? "these sizes go" : "this size goes"} on sale straight away.`
                : `${family.title} is not in the shop yet, so ${many ? "these sizes stay" : "this size stays"} off sale too.`
              : "It goes in as a draft. Switch it on under Products, In the shop, to sell it."}{" "}
            Prices wrong?{" "}
            <Link
              href={to(costingsHrefFor(pushingSizes.map((s) => s.itemId)))}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Change them in Costings
            </Link>
            .
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              className="mt-0.5"
            />
            <span>
              I&apos;ve checked these prices
              {belowCost.length > 0 ? ", including the sizes sold at or below cost" : ""}
            </span>
          </label>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>
          Cancel
        </Button>
        <Button onClick={() => void push()} disabled={!ready || !checked || pushing}>
          {pushing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {adding
            ? `Add ${pushingSizes.length} size${many ? "s" : ""}`
            : "Push to Products"}
        </Button>
      </DialogFooter>
    </>
  );
}
