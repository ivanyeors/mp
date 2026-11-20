"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const TabLoading = () => (
  <div className="flex justify-center py-16">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const ProductVisualize = dynamic(
  () => import("./product-visualize").then((m) => m.ProductVisualize),
  {
    ssr: false,
    loading: TabLoading,
  },
);
const DimensionsSection = dynamic(
  () => import("./dimensions-section").then((m) => m.DimensionsSection),
  {
    ssr: false,
    loading: TabLoading,
  },
);
const SoftBodySection = dynamic(
  () => import("./soft-body-section").then((m) => m.SoftBodySection),
  {
    ssr: false,
    loading: TabLoading,
  },
);

export type ConfigureTab = "products" | "visualize" | "dimensions" | "soft-body";

export function ConfigureClient({ initialTab }: { initialTab: ConfigureTab }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const settingsPath = useCallback(
    (path: string) => withLocale(path, locale),
    [locale],
  );
  const cardPath = (card: string) =>
    settingsPath(`/settings/inventory/configure/${card}`);

  const [partsCount, setPartsCount] = useState(makeEmptyCounts);

  useEffect(() => {
    const load = async () => {
      const [{ data: productsData }, { data: bomData }] = await Promise.all([
        supabaseClient
          .from("pillow_products")
          .select("id,size,kind")
          .eq("is_active", true),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
      ]);
      const byProduct = new Map<number, { kind: PillowKind; size: Size }>();
      for (const p of productsData ?? []) {
        if (p.kind === "basic" || p.kind === "premium") {
          byProduct.set(Number(p.id), { kind: p.kind, size: p.size as Size });
        }
      }
      const qtyByCardItem = new Map<string, number>();
      for (const row of bomData ?? []) {
        const product = byProduct.get(Number(row.product_id));
        if (!product) continue;
        qtyByCardItem.set(
          `${product.kind}/${product.size}/${row.item_id}`,
          Number(row.quantity),
        );
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
      <h1>Configure products</h1>
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="visualize">Product Visualize</TabsTrigger>
          <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
          <TabsTrigger value="soft-body">Soft body</TabsTrigger>
        </TabsList>
        <TabsContent value="visualize" className="mt-6">
          <ProductVisualize />
        </TabsContent>
        <TabsContent value="dimensions" className="mt-6">
          <DimensionsSection settingsPath={settingsPath} />
        </TabsContent>
        <TabsContent value="soft-body" className="mt-6">
          <SoftBodySection settingsPath={settingsPath} />
        </TabsContent>
        <TabsContent value="products" className="mt-6 space-y-6">
          {(["basic", "premium"] as const).map((kind) => (
            <div key={kind} className="space-y-4">
              <div className="text-lg font-semibold md:text-2xl">
                {kind === "basic" ? "Basic Mpillow" : "Premium Mpillow"}
              </div>
              <MobileList>
                {SIZES.map((size) => (
                  <MobileListRow key={`${kind}-${size}`} href={cardPath(`${kind}-${size}`)}>
                    <span className="font-medium">{size}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {partsCount[kind][size] === 1 ? "1 part" : `${partsCount[kind][size]} parts`}
                    </span>
                  </MobileListRow>
                ))}
              </MobileList>
              <div className="hidden grid-cols-2 gap-3 md:grid md:grid-cols-5">
                {SIZES.map((size) => (
                  <Link
                    key={`${kind}-${size}`}
                    href={cardPath(`${kind}-${size}`)}
                    className="rounded-lg border p-4 hover:bg-muted/50 active:bg-press cursor-pointer select-none"
                  >
                    <div className="text-xs text-muted-foreground">Size</div>
                    <div className="text-2xl font-semibold">{size}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {partsCount[kind][size]} parts configured
                    </div>
                    <div className="mt-3">
                      <Button size="sm" variant="secondary">
                        Configure
                      </Button>
                    </div>
                  </Link>
                ))}
              </div>
              <Separator />
            </div>
          ))}
          <div className="space-y-2">
            <div className="text-lg font-semibold md:text-2xl">Mbolster</div>
            <MobileList>
              {BOLSTER_CARDS.map((v) => (
                <MobileListRow key={v.card} href={cardPath(v.card)}>
                  <span className="font-medium">{v.label}</span>
                  <span className="block text-xs text-muted-foreground">Case, protector, 6D (L)</span>
                </MobileListRow>
              ))}
            </MobileList>
            <div className="hidden grid-cols-2 gap-3 md:grid md:grid-cols-5">
              {BOLSTER_CARDS.map((v) => (
                <Link
                  key={v.card}
                  href={cardPath(v.card)}
                  className="rounded-lg border p-4 hover:bg-muted/50 active:bg-press cursor-pointer select-none"
                >
                  <div className="text-xs text-muted-foreground">Bolster</div>
                  <div className="text-2xl font-semibold">{v.label}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Case, protector, 6D (L)
                  </div>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary">
                      Configure
                    </Button>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
