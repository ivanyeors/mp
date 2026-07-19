"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";

type PillowKind = "basic" | "premium";
type Size = "XS" | "S" | "M" | "L" | "XL";

const SIZES: Size[] = ["XS", "S", "M", "L", "XL"];

const makeEmptyCounts = (): Record<PillowKind, Record<Size, number>> => ({
  basic: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
  premium: { XS: 0, S: 0, M: 0, L: 0, XL: 0 },
});

const BOLSTER_CARDS = [
  { card: "bolster-short", label: "Short (0.8m)" },
  { card: "bolster-medium", label: "Medium (1m)" },
  { card: "bolster-long", label: "Long (1.2m)" },
];

export default function ConfigureInventoryPage() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const cardPath = (card: string) => withLocale(`/settings/inventory/configure/${card}`, locale);

  const [partsCount, setPartsCount] = useState(makeEmptyCounts);

  useEffect(() => {
    const load = async () => {
      const [{ data: productsData }, { data: bomData }] = await Promise.all([
        supabaseClient.from("pillow_products").select("id,size,kind").eq("is_active", true),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
      ]);
      const byProduct = new Map<number, { kind: PillowKind; size: Size }>();
      for (const p of productsData ?? []) {
        if (p.kind === "basic" || p.kind === "premium") {
          byProduct.set(Number(p.id), { kind: p.kind, size: p.size as Size });
        }
      }
      // Same item_id twice for one card keeps the last row's qty (matches the old grid's de-dupe).
      const qtyByCardItem = new Map<string, number>();
      for (const row of bomData ?? []) {
        const product = byProduct.get(Number(row.product_id));
        if (!product) continue;
        qtyByCardItem.set(`${product.kind}/${product.size}/${row.item_id}`, Number(row.quantity));
      }
      const next = makeEmptyCounts();
      for (const [key, qty] of qtyByCardItem) {
        if (qty <= 0) continue;
        const [kind, size] = key.split("/") as [PillowKind, Size];
        next[kind][size] += 1;
      }
      setPartsCount(next);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1>Configure Products</h1>
      <Separator />
      {(["basic", "premium"] as const).map((kind) => (
        <div key={kind} className="space-y-4">
          <div className="text-2xl font-semibold">{kind === "basic" ? "Basic Mpillow" : "Premium Mpillow"}</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {SIZES.map((size) => (
              <Link
                key={`${kind}-${size}`}
                href={cardPath(`${kind}-${size}`)}
                className="rounded-lg border p-4 hover:bg-muted/50 cursor-pointer select-none"
              >
                <div className="text-xs text-muted-foreground">Size</div>
                <div className="text-2xl font-semibold">{size}</div>
                <div className="mt-2 text-xs text-muted-foreground">{partsCount[kind][size]} parts configured</div>
                <div className="mt-3">
                  <Button size="sm" variant="secondary">Configure</Button>
                </div>
              </Link>
            ))}
          </div>
          <Separator />
        </div>
      ))}
      <div className="space-y-2">
        <div className="text-2xl font-semibold">Mbolster</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {BOLSTER_CARDS.map((v) => (
            <Link
              key={v.card}
              href={cardPath(v.card)}
              className="rounded-lg border p-4 hover:bg-muted/50 cursor-pointer select-none"
            >
              <div className="text-xs text-muted-foreground">Bolster</div>
              <div className="text-2xl font-semibold">{v.label}</div>
              <div className="mt-2 text-xs text-muted-foreground">Case, Protector, 6D (L)</div>
              <div className="mt-3">
                <Button size="sm" variant="secondary">Configure</Button>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
