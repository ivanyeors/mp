"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ChevronDown, Trash2 } from "lucide-react";
import {
  sellPillow,
  sellPart,
  receiveStock,
  sellBolster,
  sellFromTemplate,
  listShopifySalesQueue,
  listShopifySalesQueueArchived,
  listTemplates,
  commitShopifySales,
  addInventoryItem,
  deleteInventoryItem,
  renameInventoryItem,
  refreshShopifySalesQueueFromShopify,
} from "./actions";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DateRange } from "react-day-picker";
import {
  InventoryItemLabel,
  getInventoryItemDisplayLabel,
  getInventoryItemLabelParts,
  getInventoryVariantName,
} from "./item-label";

const ITEM_CATEGORIES = [
  'cover',
  'pillow_case',
  'pillow_protector',
  'bolster_case',
  'bolster_protector',
  'filling',
  'packaging',
  'accessories',
  'other',
] as const;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];
const CATEGORY_TITLES: Record<ItemCategory, string> = {
  cover: 'Covers',
  pillow_case: 'Pillow Cases',
  pillow_protector: 'Pillow Protectors',
  bolster_case: 'Bolster Cases',
  bolster_protector: 'Bolster Protectors',
  filling: 'Fillings',
  packaging: 'Packaging',
  accessories: 'Accessories',
  other: 'Other',
};
const SIZED_CATEGORIES: ItemCategory[] = ['cover','pillow_case','pillow_protector','bolster_case','bolster_protector'];
const SIZE_OPTIONS = ['-','XS','S','M','L','XL','BOLSTER'] as const;

type Item = {
  id: number;
  category: ItemCategory;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
  alteration_name: string | null;
};
type Product = { id: number; size: string; kind: PillowKind };
type PillowKind = "basic" | "premium";
type PremiumVariant = "linen" | "fibrecool";
type AddInventoryDraft = {
  category: ItemCategory;
  name: string;
  size?: string;
  subtype?: string;
  alterationOfItemId?: number;
  alterationName?: string;
  initialStock: number;
  costPrice?: number;
  msrp?: number;
};
type AddInventoryEntry = {
  category: ItemCategory;
  name: string;
  size: string;
  subtype: string;
  alterationBaseName: string;
  alterationOfItemId: string;
  alterationName: string;
  initialStock: string;
  costPrice: string;
  msrp: string;
};
type Group = { key: string; title: string; items: Item[] };

const createDefaultEntry = (): AddInventoryEntry => ({
  category: "cover",
  name: "cover",
  size: "M",
  subtype: "",
  alterationBaseName: "",
  alterationOfItemId: "",
  alterationName: "",
  initialStock: "",
  costPrice: "",
  msrp: "",
});

const PAGE_SIZE_SHOPIFY_SALES = 100;

const formatQueueDate = (createdAt: string) => {
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return "";
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
  const day = d.getDate();
  const month = months[d.getMonth()] ?? "";
  const year = d.getFullYear();
  return `${day} ${month} ${year}`.trim();
};

const toStartOfDayIso = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
};
const toEndOfDayIso = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
};

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [buildable, setBuildable] = useState<Record<string, number>>({});
  const [premiumBuildable, setPremiumBuildable] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [partDrawerOpen, setPartDrawerOpen] = useState(false);
  const [partDrawerGroup, setPartDrawerGroup] = useState<Group | null>(null);
  type CartPillowLine = {
    id: string;
    kind: "pillow" | "bolster";
    label: string;
    templateId: number | null;
    templateName: string | null;
    quantity: number;
    pillowKind?: PillowKind;
    pillowSize?: string;
    bolsterVariant?: "short" | "medium" | "long";
  };
  const [cart, setCart] = useState<{
    pillows: CartPillowLine[];
    parts: Record<number, number>;
  }>({ pillows: [], parts: {} });
  const [bolsterLinesByVariant, setBolsterLinesByVariant] = useState<Record<'short'|'medium'|'long', Array<{ item_id: number; quantity: number }>>>({ short: [], medium: [], long: [] });
  const [customPillowSize, setCustomPillowSize] = useState<string>('M');
  const [customPillowQty, setCustomPillowQty] = useState<string>('');
  const [savingCustomPillow, setSavingCustomPillow] = useState(false);
  const [customBolsterVariant, setCustomBolsterVariant] = useState<'short'|'medium'|'long'>('medium');
  const [customBolsterQty, setCustomBolsterQty] = useState<string>('');
  const [savingCustomBolster, setSavingCustomBolster] = useState(false);
  const [customPillowDrawerOpen, setCustomPillowDrawerOpen] = useState(false);
  const [customBolsterDrawerOpen, setCustomBolsterDrawerOpen] = useState(false);
  const [customPillowLines, setCustomPillowLines] = useState<Array<{ item_id: number; quantity: number }>>([]);
  const [customBolsterLines, setCustomBolsterLines] = useState<Array<{ item_id: number; quantity: number }>>([]);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: itemsData },
      { data: balancesData },
      { data: productsData },
      { data: bomLinesData },
      { data: bolsterBomData },
    ] = await Promise.all([
      supabaseClient
        .from("items")
        .select("id,category,subtype,name,size,alteration_of_item_id,alteration_name")
        .eq("is_active", true),
      supabaseClient.from("inventory_balances").select("item_id,on_hand"),
      supabaseClient.from("pillow_products").select("id,size,kind").eq("is_active", true),
      supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
      supabaseClient.from("bolster_bom_lines").select("variant,item_id,quantity"),
    ]);

    const nextItems = (itemsData ?? []) as Item[];
    setItems(nextItems);

    type BalanceRow = { item_id: number; on_hand: number | string };
    const nextBalances = Object.fromEntries((balancesData ?? []).map((r: BalanceRow) => [r.item_id, Number(r.on_hand)]));
    setBalances(nextBalances);

    const nextProducts = (productsData ?? []) as Product[];
    setProducts(nextProducts);

    // Recompute buildable counts in-app so they match the *effective* stock rules:
    // altered filling items stock out from their base filling item.
    const itemById = new Map<number, Item>();
    nextItems.forEach((it) => itemById.set(Number(it.id), it));
    const getEffectiveOnHand = (itemId: number) => {
      const it = itemById.get(Number(itemId));
      if (it?.category === "filling" && it.alteration_of_item_id) {
        return Number(nextBalances[Number(it.alteration_of_item_id)] ?? 0);
      }
      return Number(nextBalances[Number(itemId)] ?? 0);
    };

    type BomRow = { product_id: number | string; item_id: number | string; quantity: number | string };
    const linesByProduct = new Map<number, Array<{ item_id: number; quantity: number }>>();
    (bomLinesData ?? []).forEach((r: BomRow) => {
      const productId = Number(r.product_id);
      const itemId = Number(r.item_id);
      const qty = Number(r.quantity);
      if (!Number.isFinite(productId) || productId <= 0) return;
      if (!Number.isFinite(itemId) || itemId <= 0) return;
      if (!Number.isFinite(qty) || qty <= 0) return;
      const bucket = linesByProduct.get(productId) ?? [];
      bucket.push({ item_id: itemId, quantity: qty });
      linesByProduct.set(productId, bucket);
    });

    const computeBuildable = (lines: Array<{ item_id: number; quantity: number }>) => {
      if (!lines.length) return 0;
      const counts = lines.map((l) => Math.floor(getEffectiveOnHand(l.item_id) / Math.max(1, Number(l.quantity))));
      return counts.length ? Math.max(0, Math.min(...counts)) : 0;
    };

    const nextBuildable: Record<string, number> = {};
    const nextPremiumBuildable: Record<string, number> = {};
    nextProducts.forEach((p) => {
      const kind = p.kind === "premium" ? "premium" : "basic";
      const size = String(p.size);
      const lines = linesByProduct.get(Number(p.id)) ?? [];
      const b = computeBuildable(lines);
      if (kind === "premium") nextPremiumBuildable[size] = b;
      else nextBuildable[size] = b;
    });
    setBuildable(nextBuildable);
    setPremiumBuildable(nextPremiumBuildable);

    // Keep bolster buildable in sync with the configured bolster lines too.
    type BolsterRow = { variant: "short" | "medium" | "long"; item_id: number | string; quantity: number | string };
    const grouped: Record<"short" | "medium" | "long", Array<{ item_id: number; quantity: number }>> = {
      short: [],
      medium: [],
      long: [],
    };
    (bolsterBomData ?? []).forEach((r: BolsterRow) => {
      const v = r.variant;
      const itemId = Number(r.item_id);
      const qty = Number(r.quantity);
      if (v !== "short" && v !== "medium" && v !== "long") return;
      if (!Number.isFinite(itemId) || itemId <= 0) return;
      if (!Number.isFinite(qty) || qty <= 0) return;
      grouped[v].push({ item_id: itemId, quantity: qty });
    });
    // Back-compat: if bolster lines aren't in DB yet, fall back to the cached editor state.
    if (typeof window !== "undefined") {
      (["short", "medium", "long"] as const).forEach((v) => {
        if (grouped[v].length > 0) return;
        try {
          const raw = window.localStorage.getItem(`bolster_bom_lines:${v}`);
          if (!raw) return;
          const parsed = JSON.parse(raw) as Array<{ item_id: number; quantity: number }>;
          if (Array.isArray(parsed) && parsed.length) grouped[v] = parsed;
        } catch {
          // ignore
        }
      });
    }
    setBolsterLinesByVariant(grouped);

    setLoading(false);
  }, []);

  const notifyInventoryChange = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('inventory:changed'));
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('inventory:changed');
        channel.postMessage('refresh');
        channel.close();
      }
    } catch {
      // ignore broadcast failures in unsupported browsers
    }
  }, []);

  // Listen for inventory changes broadcast from other pages (e.g. Configure).
  useEffect(() => {
    const onChanged = () => { load(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('inventory:changed', onChanged);
      let bc: BroadcastChannel | null = null;
      try {
        if ('BroadcastChannel' in window) {
          bc = new BroadcastChannel('inventory:changed');
          bc.onmessage = () => onChanged();
        }
      } catch {}
      return () => {
        window.removeEventListener('inventory:changed', onChanged);
        try { bc?.close(); } catch {}
      };
    }
    return;
  }, [load]);

  const [sellDrawerOpen, setSellDrawerOpen] = useState(false);
  const [sellDrawerKind, setSellDrawerKind] = useState<"pillow" | "bolster">("pillow");
  const [sellDrawerSize, setSellDrawerSize] = useState<string>("M");
  const [sellDrawerBolsterVariant, setSellDrawerBolsterVariant] = useState<"short" | "medium" | "long">("medium");
  const [sellDrawerPillowKind, setSellDrawerPillowKind] = useState<PillowKind>("basic");
  const [sellDrawerPremiumVariant, setSellDrawerPremiumVariant] = useState<PremiumVariant>("linen");
  const [sellDrawerTemplates, setSellDrawerTemplates] = useState<Array<{ id: number; name: string }>>([]);
  const [sellDrawerTemplateId, setSellDrawerTemplateId] = useState<number | "">("");
  const [sellDrawerTemplateName, setSellDrawerTemplateName] = useState<string | null>(null);
  const [sellDrawerLines, setSellDrawerLines] = useState<Array<{ item_id: number; quantity: number }>>([]);
  const [sellDrawerQty, setSellDrawerQty] = useState<string>("1");

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((it) => map.set(it.id, it));
    return map;
  }, [items]);

  // Shopify sales queue
  type ShopifyQueueRow = {
    id: number;
    shopify_order_id: number;
    shopify_line_item_id: number | null;
    shopify_variant_id: number | null;
    kind: "pillow" | "bolster" | "part";
    pillow_size: string | null;
    pillow_kind: "basic" | "premium" | null;
    bolster_variant: "short" | "medium" | "long" | null;
    item_id: number | null;
    quantity: number;
    variant_title: string | null;
    sku: string | null;
    created_at: string;
    chosen_template_id: number | null;
    fulfillment_status: string | null;
  };
  const [shopifyQueue, setShopifyQueue] = useState<ShopifyQueueRow[]>([]);
  const [shopifyQueueArchived, setShopifyQueueArchived] = useState<ShopifyQueueRow[]>([]);
  const [shopifyTemplatesByKey, setShopifyTemplatesByKey] = useState<Record<string, Array<{ id: number; name: string }>>>({});
  const [shopifyTemplateChoice, setShopifyTemplateChoice] = useState<Record<number, number | "">>({});
  const [loadingShopifySales, setLoadingShopifySales] = useState(false);
  const [savingShopifySales, setSavingShopifySales] = useState(false);
  const [shopifySalesTab, setShopifySalesTab] = useState<'active' | 'archived'>('active');
  const [shopifySalesSearch, setShopifySalesSearch] = useState<string>('');
  const [shopifyRefreshRange, setShopifyRefreshRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  });
  const [shopifyRefreshLimit, setShopifyRefreshLimit] = useState<number>(250);
  const [shopifyActivePage, setShopifyActivePage] = useState(1);
  const [shopifyArchivedPage, setShopifyArchivedPage] = useState(1);

  const normalizedShopifySalesSearch = useMemo(() => shopifySalesSearch.replace(/\D/g, '').trim(), [shopifySalesSearch]);
  const filteredShopifyQueue = useMemo(() => {
    if (!normalizedShopifySalesSearch) return shopifyQueue;
    return shopifyQueue.filter((r) => String(r.shopify_order_id).includes(normalizedShopifySalesSearch));
  }, [normalizedShopifySalesSearch, shopifyQueue]);
  const filteredShopifyQueueArchived = useMemo(() => {
    if (!normalizedShopifySalesSearch) return shopifyQueueArchived;
    return shopifyQueueArchived.filter((r) => String(r.shopify_order_id).includes(normalizedShopifySalesSearch));
  }, [normalizedShopifySalesSearch, shopifyQueueArchived]);

  useEffect(() => {
    setShopifyActivePage(1);
    setShopifyArchivedPage(1);
  }, [normalizedShopifySalesSearch]);

  const pagedShopifyQueue = useMemo(() => {
    const start = (shopifyActivePage - 1) * PAGE_SIZE_SHOPIFY_SALES;
    return filteredShopifyQueue.slice(start, start + PAGE_SIZE_SHOPIFY_SALES);
  }, [filteredShopifyQueue, shopifyActivePage]);
  const pagedShopifyQueueArchived = useMemo(() => {
    const start = (shopifyArchivedPage - 1) * PAGE_SIZE_SHOPIFY_SALES;
    return filteredShopifyQueueArchived.slice(start, start + PAGE_SIZE_SHOPIFY_SALES);
  }, [filteredShopifyQueueArchived, shopifyArchivedPage]);

  const renderPagination = (args: { total: number; page: number; setPage: (n: number) => void }) => {
    const totalPages = Math.max(1, Math.ceil(args.total / PAGE_SIZE_SHOPIFY_SALES));
    if (args.total <= PAGE_SIZE_SHOPIFY_SALES) return null;

    const page = Math.min(Math.max(1, args.page), totalPages);
    const go = (p: number) => args.setPage(Math.min(Math.max(1, p), totalPages));
    const mkHref = (p: number) => `#shopify-sales-page-${p}`;

    // Simple windowed pagination with ellipses.
    const windowSize = 5;
    const start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const pages = [];
    for (let p = start; p <= end; p += 1) pages.push(p);

    return (
      <Pagination className="py-3">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={mkHref(page - 1)}
              onClick={(e) => { e.preventDefault(); go(page - 1); }}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          {start > 1 ? (
            <>
              <PaginationItem>
                <PaginationLink href={mkHref(1)} onClick={(e) => { e.preventDefault(); go(1); }} size="default">
                  1
                </PaginationLink>
              </PaginationItem>
              {start > 2 ? (
                <PaginationItem>
                  <span className="px-2 text-sm text-muted-foreground">…</span>
                </PaginationItem>
              ) : null}
            </>
          ) : null}
          {pages.map((p) => (
            <PaginationItem key={p}>
              <PaginationLink
                href={mkHref(p)}
                onClick={(e) => { e.preventDefault(); go(p); }}
                isActive={p === page}
                size="default"
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
          {end < totalPages ? (
            <>
              {end < totalPages - 1 ? (
                <PaginationItem>
                  <span className="px-2 text-sm text-muted-foreground">…</span>
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <PaginationLink
                  href={mkHref(totalPages)}
                  onClick={(e) => { e.preventDefault(); go(totalPages); }}
                  size="default"
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            </>
          ) : null}
          <PaginationItem>
            <PaginationNext
              href={mkHref(page + 1)}
              onClick={(e) => { e.preventDefault(); go(page + 1); }}
              aria-disabled={page >= totalPages}
              className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  const getEffectiveOnHand = useCallback((itemId: number) => {
    const it = itemsById.get(Number(itemId));
    if (it?.category === "filling" && it.alteration_of_item_id) {
      return Number(balances[Number(it.alteration_of_item_id)] ?? 0);
    }
    return Number(balances[Number(itemId)] ?? 0);
  }, [balances, itemsById]);

  const computeBuildableFromLines = useCallback((lines: Array<{ item_id: number; quantity: number }>) => {
    if (!lines.length) return 0;
    const counts = lines.map((l) => Math.floor(getEffectiveOnHand(l.item_id) / Math.max(1, Number(l.quantity))));
    return counts.length ? Math.max(0, Math.min(...counts)) : 0;
  }, [getEffectiveOnHand]);

  const openSellDrawerForPillow = async (size: string, pillowKind: PillowKind = "basic", premiumVariant: PremiumVariant = "linen") => {
    setSellDrawerKind("pillow");
    setSellDrawerSize(size);
    setSellDrawerPillowKind(pillowKind);
    setSellDrawerPremiumVariant(premiumVariant);
    setSellDrawerTemplateId("");
    setSellDrawerTemplateName(null);
    setSellDrawerQty("1");
    setSellDrawerLines([]);
    setSellDrawerTemplates([]);
    setSellDrawerOpen(true);
    try {
      const payload = await listTemplates('pillow', size, pillowKind, pillowKind === "premium" ? premiumVariant : undefined);
      type TemplateRow = { id: number; name: string };
      const list = (payload.templates ?? []) as TemplateRow[];
      setSellDrawerTemplates(list.map((t) => ({ id: Number(t.id), name: String(t.name) })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    }
  };

  const openSellDrawerForBolster = async (variant: "short" | "medium" | "long") => {
    setSellDrawerKind("bolster");
    setSellDrawerBolsterVariant(variant);
    setSellDrawerTemplateId("");
    setSellDrawerTemplateName(null);
    setSellDrawerQty("1");
    setSellDrawerLines([]);
    setSellDrawerTemplates([]);
    setSellDrawerOpen(true);
    try {
      const payload = await listTemplates('bolster', variant);
      type TemplateRow = { id: number; name: string };
      const list = (payload.templates ?? []) as TemplateRow[];
      setSellDrawerTemplates(list.map((t) => ({ id: Number(t.id), name: String(t.name) })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    }
  };

  const loadSelectedTemplateLines = useCallback(async (templateId: number) => {
    const res = await fetch(`/settings/inventory/configure/templates/${templateId}`);
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error ?? "Failed to load template");
    type LineRow = { item_id: number | string; quantity: number | string };
    const lines = ((payload?.lines ?? []) as LineRow[]).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) }));
    setSellDrawerLines(lines);
    const name = payload?.template?.name ? String(payload.template.name) : null;
    setSellDrawerTemplateName(name);
  }, []);

  const loadShopifySalesQueue = useCallback(async () => {
    setLoadingShopifySales(true);
    try {
      const payload = await listShopifySalesQueue();
      const rows = (payload.rows ?? []) as ShopifyQueueRow[];
      const normalized = rows.map((r) => ({
        id: Number(r.id),
        shopify_order_id: Number(r.shopify_order_id),
        shopify_line_item_id: r.shopify_line_item_id === null ? null : Number(r.shopify_line_item_id),
        shopify_variant_id: r.shopify_variant_id === null ? null : Number(r.shopify_variant_id),
        kind: r.kind as ShopifyQueueRow["kind"],
        pillow_size: r.pillow_size ?? null,
        pillow_kind: (r as unknown as { pillow_kind?: string | null }).pillow_kind === 'premium' ? 'premium' : ((r as unknown as { pillow_kind?: string | null }).pillow_kind === 'basic' ? 'basic' : null),
        bolster_variant: r.bolster_variant ?? null,
        item_id: r.item_id === null ? null : Number(r.item_id),
        quantity: Number(r.quantity),
        variant_title: r.variant_title ?? null,
        sku: r.sku ?? null,
        created_at: String(r.created_at),
        chosen_template_id: r.chosen_template_id === null ? null : Number(r.chosen_template_id),
        fulfillment_status: (r as unknown as { fulfillment_status?: string | null }).fulfillment_status ?? null,
      })) as ShopifyQueueRow[];
      setShopifyQueue(normalized);
      // initialize template choice state
      setShopifyTemplateChoice((prev) => {
        const next = { ...prev };
        normalized.forEach((row) => {
          if (row.kind === 'pillow' || row.kind === 'bolster') {
            if (next[row.id] === undefined) next[row.id] = row.chosen_template_id ?? '';
          }
        });
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load Shopify sales');
    } finally {
      setLoadingShopifySales(false);
    }
  }, []);

  const loadShopifySalesQueueArchived = useCallback(async () => {
    setLoadingShopifySales(true);
    try {
      const payload = await listShopifySalesQueueArchived();
      const rows = (payload.rows ?? []) as ShopifyQueueRow[];
      const normalized = rows.map((r) => ({
        id: Number(r.id),
        shopify_order_id: Number(r.shopify_order_id),
        shopify_line_item_id: r.shopify_line_item_id === null ? null : Number(r.shopify_line_item_id),
        shopify_variant_id: r.shopify_variant_id === null ? null : Number(r.shopify_variant_id),
        kind: r.kind as ShopifyQueueRow["kind"],
        pillow_size: r.pillow_size ?? null,
        pillow_kind: (r as unknown as { pillow_kind?: string | null }).pillow_kind === 'premium' ? 'premium' : ((r as unknown as { pillow_kind?: string | null }).pillow_kind === 'basic' ? 'basic' : null),
        bolster_variant: r.bolster_variant ?? null,
        item_id: r.item_id === null ? null : Number(r.item_id),
        quantity: Number(r.quantity),
        variant_title: r.variant_title ?? null,
        sku: r.sku ?? null,
        created_at: String(r.created_at),
        chosen_template_id: r.chosen_template_id === null ? null : Number(r.chosen_template_id),
        fulfillment_status: (r as unknown as { fulfillment_status?: string | null }).fulfillment_status ?? null,
      })) as ShopifyQueueRow[];
      setShopifyQueueArchived(normalized);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load archived Shopify sales');
    } finally {
      setLoadingShopifySales(false);
    }
  }, []);

  useEffect(() => {
    loadShopifySalesQueue();
  }, [loadShopifySalesQueue]);

  // Load templates for keys present in queue (pillow sizes + bolster variants)
  useEffect(() => {
    const load = async () => {
      const needed: Array<{ kind: 'pillow' | 'bolster'; key: string; pillowKind?: 'basic' | 'premium' }> = [];
      shopifyQueue.forEach((row) => {
        if (row.kind === 'pillow' && row.pillow_size) needed.push({ kind: 'pillow', key: row.pillow_size, pillowKind: row.pillow_kind ?? 'basic' });
        if (row.kind === 'bolster' && row.bolster_variant) needed.push({ kind: 'bolster', key: row.bolster_variant });
      });
      const unique = new Map<string, { kind: 'pillow' | 'bolster'; key: string; pillowKind?: 'basic' | 'premium' }>();
      needed.forEach((n) => unique.set(`${n.kind}:${n.kind === 'pillow' ? (n.pillowKind ?? 'basic') : ''}:${n.key}`, n));
      for (const entry of unique.values()) {
        const cacheKey = entry.kind === 'pillow' ? `pillow:${entry.pillowKind ?? 'basic'}:${entry.key}` : `bolster:${entry.key}`;
        if (shopifyTemplatesByKey[cacheKey]) continue;
        try {
          const payload = await listTemplates(entry.kind, entry.key, entry.kind === 'pillow' ? (entry.pillowKind ?? 'basic') : undefined);
          setShopifyTemplatesByKey((prev) => ({
            ...prev,
            [cacheKey]: ((payload.templates ?? []) as Array<{ id: number; name: string }>).map((t) => ({ id: Number(t.id), name: String(t.name) })),
          }));
        } catch {
          // ignore; will show empty dropdown
        }
      }
    };
    load();
  }, [shopifyQueue, shopifyTemplatesByKey]);

  const handleCreateItem = async (draft: AddInventoryDraft) => {
    try {
      await addInventoryItem({
        category: draft.category,
        name: draft.name,
        size: draft.size,
        subtype: draft.subtype,
        alterationOfItemId: draft.alterationOfItemId,
        alterationName: draft.alterationName,
        initialStock: draft.initialStock,
        costPrice: draft.costPrice,
        msrp: draft.msrp,
      });
      toast.success("Inventory item added");
      await load();
      notifyInventoryChange();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add inventory item";
      throw new Error(message);
    }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabaseClient
      .channel('inventory-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    const loadCustomPillowLines = async () => {
      if (!customPillowDrawerOpen) return;
      const product = products.find(p => p.size === customPillowSize && p.kind === 'basic');
      if (!product) { setCustomPillowLines([]); return; }
      type BomRow = { item_id: number; quantity: number | string };
      const { data } = await supabaseClient.from('bom_lines').select('item_id,quantity').eq('product_id', product.id);
      const rows = (data ?? []).map((r: BomRow) => ({ item_id: r.item_id, quantity: Number(r.quantity) }));
      setCustomPillowLines(rows);
    };
    loadCustomPillowLines();
  }, [customPillowDrawerOpen, customPillowSize, products]);

  useEffect(() => {
    const loadCustomBolsterLines = async () => {
      if (!customBolsterDrawerOpen) return;
      type LineRow = { item_id: number; quantity: number | string };
      const { data } = await supabaseClient
        .from('bolster_bom_lines')
        .select('item_id,quantity')
        .eq('variant', customBolsterVariant);
      const rows = (data ?? []).map((l: LineRow) => ({ item_id: l.item_id, quantity: Number(l.quantity) }));
      setCustomBolsterLines(rows);
    };
    loadCustomBolsterLines();
  }, [customBolsterDrawerOpen, customBolsterVariant]);

  const partGroups = useMemo(() => {
    const grouped = new Map<Item['category'], Item[]>();
    for (const item of items) {
      const bucket = grouped.get(item.category) ?? [];
      bucket.push(item);
      grouped.set(item.category, bucket);
    }
    const categoryOrder = new Map<ItemCategory, number>(ITEM_CATEGORIES.map((category, index) => [category, index]));
    return Array.from(grouped.entries())
      .sort(([categoryA], [categoryB]) => {
        const orderA = categoryOrder.get(categoryA) ?? Number.MAX_SAFE_INTEGER;
        const orderB = categoryOrder.get(categoryB) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return categoryA.localeCompare(categoryB);
      })
      .map(([category, groupItems]) => ({
        key: `category:${category}`,
        title: CATEGORY_TITLES[category] ?? category,
        items: groupItems,
      }));
  }, [items]);

  useEffect(() => {
    if (!partDrawerOpen || !partDrawerGroup) return;
    if (partDrawerGroup.key === 'custom') {
      setPartDrawerGroup((prev) => {
        if (!prev) return prev;
        if (prev.items === items) return prev;
        return { ...prev, items };
      });
      return;
    }
    const updated = partGroups.find((group) => group.key === partDrawerGroup.key);
    if (!updated) {
      setPartDrawerGroup(null);
      setPartDrawerOpen(false);
      return;
    }
    if (partDrawerGroup.items !== updated.items) {
      setPartDrawerGroup(updated);
    }
  }, [items, partDrawerGroup, partDrawerOpen, partGroups]);

  const lowStock = useMemo(() => {
    return items.filter((i) => {
      const balanceId = i.category === "filling" && i.alteration_of_item_id ? i.alteration_of_item_id : i.id;
      return (balances[balanceId] ?? 0) <= 0;
    });
  }, [items, balances]);

  const incrementPillowSelection = (size: string) => {
    let available = 0;
    if (['XS','S','M','L','XL'].includes(size)) {
      available = Number(buildable[size] ?? 0);
    } else if (size === 'Bolster') {
      available = Number(buildableBolsterMedium ?? 0);
    } else if (String(size).includes('Bolster')) {
      const s = String(size);
      if (s.includes('Short')) available = Number(buildableBolsterShort ?? 0);
      else if (s.includes('Long')) available = Number(buildableBolsterLong ?? 0);
      else available = Number(buildableBolsterMedium ?? 0);
    }
    if (available <= 0) {
      toast.message('Out of stock');
      return;
    }
    // New flow: open drawer to choose template then add to cart
    if (String(size).includes('Bolster')) {
      const s = String(size);
      const v = s.includes('Short') ? 'short' : s.includes('Long') ? 'long' : 'medium';
      openSellDrawerForBolster(v);
      return;
    }
    openSellDrawerForPillow(size, "basic");
  };

  const commitQueuedShopifySales = async () => {
    const commits: Array<{ queueId: number; templateId: number | null }> = []
    for (const row of shopifyQueue) {
      if (row.kind === 'part') {
        commits.push({ queueId: row.id, templateId: null })
        continue
      }
      const chosen = shopifyTemplateChoice[row.id]
      if (chosen === undefined || chosen === '') continue
      commits.push({ queueId: row.id, templateId: Number(chosen) })
    }

    // Ensure all pillow/bolster rows have a template selected
    const missing = shopifyQueue.filter(
      (r) =>
        (r.kind === 'pillow' || r.kind === 'bolster') &&
        (shopifyTemplateChoice[r.id] === undefined || shopifyTemplateChoice[r.id] === ''),
    )
    if (missing.length) {
      toast.error('Select a template for every pillow/bolster sale line before saving')
      return
    }

    if (!commits.length) {
      toast.message('No Shopify sales to commit')
      return
    }

    setSavingShopifySales(true)
    try {
      await commitShopifySales({ commits })
      toast.success('Shopify sales committed')
      await load()
      await loadShopifySalesQueue()
      notifyInventoryChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to commit Shopify sales')
    } finally {
      setSavingShopifySales(false)
    }
  }

  const stockOutQueueRow = async (row: ShopifyQueueRow) => {
    if (row.kind === 'pillow' || row.kind === 'bolster') {
      const chosen = shopifyTemplateChoice[row.id];
      if (chosen === undefined || chosen === '') {
        toast.error('Select a template before stocking out');
        return;
      }
    }

    setSavingShopifySales(true);
    try {
      const templateId =
        row.kind === 'part'
          ? null
          : Number(shopifyTemplateChoice[row.id]);
      await commitShopifySales({ commits: [{ queueId: row.id, templateId }] });
      toast.success('Stocked out');
      await load();
      await loadShopifySalesQueue();
      if (shopifySalesTab === 'archived') await loadShopifySalesQueueArchived();
      notifyInventoryChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to stock out');
    } finally {
      setSavingShopifySales(false);
    }
  };

  const renderShopifySalesTable = (rows: ShopifyQueueRow[], mode: 'active' | 'archived') => {
    if (rows.length === 0) {
      return (
        <div className="rounded border p-3 text-sm text-muted-foreground">
          {mode === 'active' ? 'No pending Shopify sales.' : 'No archived Shopify sales.'}
        </div>
      );
    }

    return (
      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="w-[160px]">Fulfillment</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="w-[90px]">Qty</TableHead>
              <TableHead className="w-[260px]">Template</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const key =
                row.kind === 'pillow'
                  ? `pillow:${row.pillow_kind ?? 'basic'}:${row.pillow_size ?? ''}`
                  : row.kind === 'bolster'
                    ? `bolster:${row.bolster_variant ?? ''}`
                    : null;
              const options = key ? (shopifyTemplatesByKey[key] ?? []) : [];
              const needsTemplate = row.kind === 'pillow' || row.kind === 'bolster';
              const partItem = row.kind === 'part' && row.item_id ? (itemsById.get(row.item_id) ?? null) : null;
              const label =
                row.kind === 'pillow'
                  ? `${row.pillow_kind === 'premium' ? 'Premium' : 'Basic'} Pillow ${row.pillow_size ?? ''}`
                  : row.kind === 'bolster'
                    ? `Bolster ${row.bolster_variant ?? ''}`
                    : partItem
                      ? getInventoryItemDisplayLabel(partItem)
                      : `Part ${row.item_id ?? ''}`;
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatQueueDate(row.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">#{row.shopify_order_id}</div>
                    <div className="text-xs text-muted-foreground">{row.sku ?? ''}</div>
                    <div className="text-xs text-muted-foreground">
                      {(row.variant_title ?? '').trim() ? `${String(row.variant_title).trim()} — ` : ''}
                      {row.shopify_variant_id ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {(row.fulfillment_status ?? 'unfulfilled').toString().toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.kind === 'part' && partItem ? (
                      <>
                        <InventoryItemLabel item={partItem} />
                        <div className="text-xs text-muted-foreground">{row.variant_title ?? ''}</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{label}</div>
                          {row.kind === 'part' && row.item_id && !partItem ? (
                            <span className="inline-flex items-center rounded border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Unmapped
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{row.variant_title ?? ''}</div>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{row.quantity}</TableCell>
                  <TableCell>
                    {needsTemplate ? (
                      <Select
                        value={
                          mode === 'archived'
                            ? String(row.chosen_template_id ?? '')
                            : (shopifyTemplateChoice[row.id] === undefined ? '' : String(shopifyTemplateChoice[row.id] ?? ''))
                        }
                        onValueChange={(value) =>
                          setShopifyTemplateChoice((prev) => ({
                            ...prev,
                            [row.id]: value ? Number(value) : '',
                          }))
                        }
                      >
                        <SelectTrigger className="w-full" disabled={mode === 'archived'}>
                          <SelectValue placeholder="Select template…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Select template…</SelectItem>
                          {options.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {mode === 'active' ? (
                      <Button size="sm" onClick={() => stockOutQueueRow(row)}>
                        Stock out
                      </Button>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const buildableBolsterShort = useMemo(() => computeBuildableFromLines(bolsterLinesByVariant.short), [bolsterLinesByVariant.short, computeBuildableFromLines]);
  const buildableBolsterMedium = useMemo(() => computeBuildableFromLines(bolsterLinesByVariant.medium), [bolsterLinesByVariant.medium, computeBuildableFromLines]);
  const buildableBolsterLong = useMemo(() => computeBuildableFromLines(bolsterLinesByVariant.long), [bolsterLinesByVariant.long, computeBuildableFromLines]);

  const incrementPartSelection = (itemId: number) => {
    setCart(prev => ({ ...prev, parts: { ...prev.parts, [itemId]: (prev.parts[itemId] ?? 0) + 1 } }));
  };

  const undoCartLine = (type: "pillow" | "part", key: string | number) => {
    setCart(prev => {
      if (type === "pillow") {
        const id = String(key);
        return { ...prev, pillows: prev.pillows.filter((l) => l.id !== id) };
      } else {
        const id = Number(key);
        const nextQty = Math.max(0, (prev.parts[id] ?? 0) - 1);
        const next = { ...prev.parts };
        if (nextQty === 0) delete next[id]; else next[id] = nextQty;
        return { ...prev, parts: next };
      }
    });
  };

  const sellFromCart = async () => {
    const pillowLines = cart.pillows;
    const partEntries = Object.entries(cart.parts);
    if (pillowLines.length === 0 && partEntries.length === 0) {
      toast.message("Cart is empty");
      return;
    }
    try {
      // Process pillows
      for (const line of pillowLines) {
        if (line.quantity <= 0) continue;
        if (line.templateId) {
          await sellFromTemplate({ templateId: line.templateId, quantity: line.quantity });
          continue;
        }
        if (line.kind === 'bolster') {
          await sellBolster({ quantity: line.quantity, variant: line.bolsterVariant ?? 'medium' });
          continue;
        }
        const size = String(line.pillowSize ?? line.label);
        const kind: PillowKind = line.pillowKind === 'premium' ? 'premium' : 'basic';
        const product = products.find(p => p.size === size && p.kind === kind);
        if (product) await sellPillow({ productId: product.id, quantity: line.quantity });
      }
      // Process parts
      for (const [itemIdStr, qty] of partEntries) {
        const itemId = Number(itemIdStr);
        if (qty > 0) {
          await sellPart({ itemId, quantity: qty as number });
        }
      }
      setCart({ pillows: [], parts: {} });
      await load();
      toast.success("Sale completed");
      setCartOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to sell';
      toast.error(message);
    }
  };

  const onReceive = async (itemId: number, qty: number) => {
    if (!qty || qty <= 0) return;
    await receiveStock({ itemId, quantity: qty });
    await load();
    toast.success(`Received ${qty} unit(s)`);
  };

const handleDeleteItem = useCallback(async (itemId: number) => {
    try {
      await deleteInventoryItem({ itemId });
      toast.success("Item removed");
      await load();
      notifyInventoryChange();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete item";
      toast.error(message);
    }
}, [load, notifyInventoryChange]);

  const handleRenameItem = useCallback(
    async (itemId: number, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed) {
        throw new Error("Name is required");
      }
      await renameInventoryItem({ itemId, name: trimmed });
      setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, name: trimmed } : item)));
      notifyInventoryChange();
    },
    [notifyInventoryChange],
  );

  // removed old inline custom pillow sell

  // removed old inline custom bolster sell

  const sellCustomPillowFromDrawer = async () => {
    const qty = parseInt((customPillowQty || '0'), 10);
    if (!qty || qty <= 0) { toast.message('Enter a quantity > 0'); return; }
    const entries = (customPillowLines ?? []).filter(l => (l.quantity ?? 0) > 0);
    if (entries.length === 0) { toast.message('No parts configured'); return; }
    setSavingCustomPillow(true);
    try {
      for (const l of entries) {
        const total = Math.max(0, Number(l.quantity) * qty);
        if (total > 0) await sellPart({ itemId: l.item_id, quantity: total });
      }
      setCustomPillowQty('');
      await load();
      toast.success('Custom pillow sold');
      setCustomPillowDrawerOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to sell custom pillow';
      toast.error(message);
    } finally {
      setSavingCustomPillow(false);
    }
  };

  const sellCustomBolsterFromDrawer = async () => {
    const qty = parseInt((customBolsterQty || '0'), 10);
    if (!qty || qty <= 0) { toast.message('Enter a quantity > 0'); return; }
    const entries = (customBolsterLines ?? []).filter(l => (l.quantity ?? 0) > 0);
    if (entries.length === 0) { toast.message('No parts configured'); return; }
    setSavingCustomBolster(true);
    try {
      for (const l of entries) {
        const total = Math.max(0, Number(l.quantity) * qty);
        if (total > 0) await sellPart({ itemId: l.item_id, quantity: total });
      }
      setCustomBolsterQty('');
      await load();
      toast.success('Custom bolster sold');
      setCustomBolsterDrawerOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to sell custom bolster';
      toast.error(message);
    } finally {
      setSavingCustomBolster(false);
    }
  };

  const addCustomPillowToCart = async () => {
    const qty = parseInt((customPillowQty || '0'), 10);
    if (!qty || qty <= 0) { toast.message('Enter a quantity > 0'); return; }
    const entries = (customPillowLines ?? []).filter(l => (l.quantity ?? 0) > 0);
    if (entries.length === 0) { toast.message('No parts configured'); return; }
    setCart(prev => {
      const nextParts = { ...prev.parts };
      for (const l of entries) {
        const total = Math.max(0, Number(l.quantity) * qty);
        if (total > 0) nextParts[l.item_id] = (nextParts[l.item_id] ?? 0) + total;
      }
      return { ...prev, parts: nextParts };
    });
    toast.success('Added to cart');
    setCustomPillowQty('');
  };

  const addCustomBolsterToCart = async () => {
    const qty = parseInt((customBolsterQty || '0'), 10);
    if (!qty || qty <= 0) { toast.message('Enter a quantity > 0'); return; }
    const entries = (customBolsterLines ?? []).filter(l => (l.quantity ?? 0) > 0);
    if (entries.length === 0) { toast.message('No parts configured'); return; }
    setCart(prev => {
      const nextParts = { ...prev.parts };
      for (const l of entries) {
        const total = Math.max(0, Number(l.quantity) * qty);
        if (total > 0) nextParts[l.item_id] = (nextParts[l.item_id] ?? 0) + total;
      }
      return { ...prev, parts: nextParts };
    });
    toast.success('Added to cart');
    setCustomBolsterQty('');
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load}>Refresh</Button>
          <Button onClick={() => setAddDrawerOpen(true)} aria-label="Add inventory item">
            Add inventory
          </Button>
          <Button onClick={() => setCartOpen(true)} aria-label="Open cart">
            <span className="mr-2" aria-hidden>🛒</span>
            Cart ({
              cart.pillows.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0) +
              Object.values(cart.parts).reduce((a, b) => a + b, 0)
            })
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Select pillows</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {['XS','S','M','L','XL'].map(sz => {
            const available = Number(buildable[sz] ?? 0);
            const disabled = available <= 0;
            return (
              <div
                key={sz}
                className={`rounded border p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40 cursor-pointer'}`}
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                onClick={() => { if (!disabled) incrementPillowSelection(sz); }}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) incrementPillowSelection(sz); }}
              >
                <div className="text-xs text-muted-foreground">{sz}</div>
                <div className="text-2xl font-semibold">{available}</div>
              </div>
            );
          })}
          {/* Custom Pillow - opens drawer */}
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setCustomPillowDrawerOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCustomPillowDrawerOpen(true); }}
          >
            <div className="text-xs text-muted-foreground">Custom</div>
            <div className="text-2xl font-semibold mt-1 truncate">Configure…</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Select premium pillows</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">Variant</div>
          <Select
            value={sellDrawerPremiumVariant}
            onValueChange={(value) => {
              if (value === "linen" || value === "fibrecool") setSellDrawerPremiumVariant(value);
            }}
          >
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Select variant…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linen">Linen</SelectItem>
              <SelectItem value="fibrecool">Fibrecool</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {['XS','S','M','L','XL'].map(sz => {
            const available = Number(premiumBuildable[sz] ?? 0);
            const disabled = available <= 0;
            return (
              <div
                key={`premium-${sz}`}
                className={`rounded border p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40 cursor-pointer'}`}
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                onClick={() => { if (!disabled) openSellDrawerForPillow(sz, "premium", sellDrawerPremiumVariant); }}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    openSellDrawerForPillow(sz, "premium", sellDrawerPremiumVariant);
                  }
                }}
              >
                <div className="text-xs text-muted-foreground">{sz}</div>
                <div className="text-2xl font-semibold">{available}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {sellDrawerPremiumVariant === "fibrecool" ? "Fibrecool" : "Linen"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bolster variants */}
      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Select bolsters</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {(() => {
            const available = Number(buildableBolsterShort ?? 0);
            const disabled = available <= 0;
            return (
              <div
                className={`rounded border p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40 cursor-pointer'}`}
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                onClick={() => { if (!disabled) incrementPillowSelection('Bolster Short (0.8m)'); }}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) incrementPillowSelection('Bolster Short (0.8m)'); }}
              >
                <div className="text-xs text-muted-foreground">Bolster</div>
                <div className="text-2xl font-semibold">{available}</div>
                <div className="mt-1 text-xs text-muted-foreground">Short (0.8m)</div>
              </div>
            );
          })()}
          {(() => {
            const available = Number(buildableBolsterMedium ?? 0);
            const disabled = available <= 0;
            return (
              <div
                className={`rounded border p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40 cursor-pointer'}`}
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                onClick={() => { if (!disabled) incrementPillowSelection('Bolster Medium (1m)'); }}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) incrementPillowSelection('Bolster Medium (1m)'); }}
              >
                <div className="text-xs text-muted-foreground">Bolster</div>
                <div className="text-2xl font-semibold">{available}</div>
                <div className="mt-1 text-xs text-muted-foreground">Medium (1m)</div>
              </div>
            );
          })()}
          {(() => {
            const available = Number(buildableBolsterLong ?? 0);
            const disabled = available <= 0;
            return (
              <div
                className={`rounded border p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40 cursor-pointer'}`}
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                onClick={() => { if (!disabled) incrementPillowSelection('Bolster Long (1.2m)'); }}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) incrementPillowSelection('Bolster Long (1.2m)'); }}
              >
                <div className="text-xs text-muted-foreground">Bolster</div>
                <div className="text-2xl font-semibold">{available}</div>
                <div className="mt-1 text-xs text-muted-foreground">Long (1.2m)</div>
              </div>
            );
          })()}
          {/* Custom Bolster - opens drawer */}
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setCustomBolsterDrawerOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCustomBolsterDrawerOpen(true); }}
          >
            <div className="text-xs text-muted-foreground">Custom bolster</div>
            <div className="text-2xl font-semibold mt-1 truncate">Configure…</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Select parts</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Custom parts card */}
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer flex flex-col gap-3"
            onClick={() => { setPartDrawerGroup({ key: 'custom', title: 'Custom parts', items }); setPartDrawerOpen(true); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setPartDrawerGroup({ key: 'custom', title: 'Custom parts', items }); setPartDrawerOpen(true); } }}
          >
            <div className="flex-1">
              <div className="font-medium">All Parts</div>
              <div className="text-xs text-muted-foreground">Open drawer for all parts</div>
            </div>
          </div>

          {partGroups.map(group => {
            const totalOnHand = group.items.reduce((sum, it) => sum + (Number(balances[it.id] ?? 0)), 0);
            return (
              <div
                key={group.key}
                className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer flex flex-col gap-3"
                onClick={() => { setPartDrawerGroup(group); setPartDrawerOpen(true); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setPartDrawerGroup(group); setPartDrawerOpen(true); } }}
              >
                <div className="flex-1">
                  <div className="font-medium">{group.title}</div>
                  <div className="text-xs text-muted-foreground">On hand: {totalOnHand}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* Shopify Sales queue */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Shopify Sales</div>
            <div className="text-xs text-muted-foreground">Review new paid orders and choose templates before committing inventory.</div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={shopifySalesSearch}
              onChange={(e) => setShopifySalesSearch(e.target.value)}
              placeholder="Search order #…"
              className="w-[220px]"
              disabled={loadingShopifySales || savingShopifySales}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" disabled={loadingShopifySales || savingShopifySales}>
                  Date range
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                sideOffset={6}
                className="p-0 w-auto"
              >
                <Calendar
                  mode="range"
                  defaultMonth={shopifyRefreshRange?.from}
                  selected={shopifyRefreshRange}
                  onSelect={setShopifyRefreshRange}
                  numberOfMonths={2}
                  className="rounded-lg border shadow-sm"
                />
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" disabled={loadingShopifySales || savingShopifySales}>
                  Limit: {shopifyRefreshLimit}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="p-3 w-[360px]">
                <DropdownMenuLabel className="px-0">Limit</DropdownMenuLabel>
                <div className="text-xs text-muted-foreground px-0 pb-2">
                  Max number of paid orders to fetch from Shopify (1–250).
                </div>
                <DropdownMenuSeparator className="mx-0" />
                <div className="pt-2 flex flex-col gap-2">
                  <div className="text-sm font-medium">Limit: {shopifyRefreshLimit}</div>
                  <Slider
                    min={1}
                    max={250}
                    step={1}
                    value={[shopifyRefreshLimit]}
                    onValueChange={(v) =>
                      setShopifyRefreshLimit(Math.max(1, Math.min(250, Math.floor(Number(v?.[0] ?? 250)))))
                    }
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="secondary"
              onClick={async () => {
                if (shopifySalesTab === 'archived') {
                  await loadShopifySalesQueueArchived();
                  return;
                }
                const from = shopifyRefreshRange?.from;
                const to = shopifyRefreshRange?.to ?? shopifyRefreshRange?.from ?? new Date();
                if (!from) {
                  toast.error("Select a start date");
                  return;
                }
                setLoadingShopifySales(true);
                try {
                  await refreshShopifySalesQueueFromShopify({
                    from: toStartOfDayIso(from),
                    to: toEndOfDayIso(to),
                    limit: shopifyRefreshLimit,
                  });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed to fetch Shopify orders');
                } finally {
                  setLoadingShopifySales(false);
                }
                setShopifyActivePage(1);
                await loadShopifySalesQueue();
              }}
              disabled={loadingShopifySales || savingShopifySales}
            >
              {loadingShopifySales ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button onClick={commitQueuedShopifySales} disabled={savingShopifySales || shopifyQueue.length === 0 || shopifySalesTab !== 'active'}>
              {savingShopifySales ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <Tabs
          value={shopifySalesTab}
          onValueChange={(v) => {
            const next = v === "archived" ? "archived" : "active";
            setShopifySalesTab(next);
            if (next === "archived" && shopifyQueueArchived.length === 0) {
              loadShopifySalesQueueArchived();
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="active">Active ({filteredShopifyQueue.length})</TabsTrigger>
            <TabsTrigger value="archived">Archived ({filteredShopifyQueueArchived.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            {renderShopifySalesTable(pagedShopifyQueue, 'active')}
            {renderPagination({ total: filteredShopifyQueue.length, page: shopifyActivePage, setPage: setShopifyActivePage })}
          </TabsContent>
          <TabsContent value="archived">
            {renderShopifySalesTable(pagedShopifyQueueArchived, 'archived')}
            {renderPagination({ total: filteredShopifyQueueArchived.length, page: shopifyArchivedPage, setPage: setShopifyArchivedPage })}
          </TabsContent>
        </Tabs>
      </section>

      <Separator />

      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Inventory management</div>
        {/* Use the Select sections above to open the drawer for stock-in per variant */}
      </section>

      {lowStock.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm text-red-600">Low or zero stock</div>
          <ul className="list-disc pl-6 text-sm">
            {lowStock.map(it => (
              <li key={it.id}>{getInventoryItemDisplayLabel(it)} — {balances[it.id] ?? 0}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Cart Drawer */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Selected items</SheetTitle>
            <SheetDescription>Review selected pillows and parts, undo, and sell.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="mx-4">
              <div className="text-sm font-medium mb-2">Pillows</div>
              {cart.pillows.length === 0 && (
                <div className="text-sm text-muted-foreground">No pillows selected</div>
              )}
              <div className="space-y-2">
                {cart.pillows.map((line) => (
                  <div key={line.id} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <div className="font-medium">{line.label}</div>
                      <div className="text-xs text-muted-foreground">Qty: {line.quantity}{line.templateName ? ` · Template: ${line.templateName}` : ''}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => undoCartLine("pillow", line.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div className="px-4">
              <div className="text-sm font-medium mb-2">Parts</div>
              {Object.keys(cart.parts).length === 0 && (
                <div className="text-sm text-muted-foreground">No parts selected</div>
              )}
              <div className="space-y-2">
                {Object.entries(cart.parts).map(([itemIdStr, qty]) => {
                  const it = items.find(i => i.id === Number(itemIdStr));
                  return (
                    <div key={itemIdStr} className="flex items-center justify-between rounded border p-2">
                      <div>
                        <div className="font-medium">{it ? getInventoryItemDisplayLabel(it) : `Item ${itemIdStr}`}</div>
                        <div className="text-xs text-muted-foreground">Qty: {qty}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => undoCartLine("part", Number(itemIdStr))}>Undo</Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={sellFromCart} className="w-full">Sell</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sell With Template Drawer */}
      <Sheet open={sellDrawerOpen} onOpenChange={setSellDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {sellDrawerKind === 'pillow'
                ? `Sell ${sellDrawerPillowKind === 'premium' ? 'premium ' : ''}pillow — ${
                    sellDrawerPillowKind === 'premium' ? `${sellDrawerPremiumVariant} — ` : ''
                  }${sellDrawerSize}`
                : `Sell bolster — ${sellDrawerBolsterVariant}`}
            </SheetTitle>
            <SheetDescription>Select a template (optional) and add to cart.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-4">
            <div className="space-y-2">
              {sellDrawerKind === 'pillow' && sellDrawerPillowKind === 'premium' && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Premium variant</div>
                  <Select
                    value={sellDrawerPremiumVariant}
                    onValueChange={async (value) => {
                      if (value !== 'linen' && value !== 'fibrecool') return;
                      setSellDrawerPremiumVariant(value);
                      setSellDrawerTemplateId('');
                      setSellDrawerLines([]);
                      setSellDrawerTemplateName(null);
                      try {
                        const payload = await listTemplates('pillow', sellDrawerSize, 'premium', value);
                        type TemplateRow = { id: number; name: string };
                        const list = (payload.templates ?? []) as TemplateRow[];
                        setSellDrawerTemplates(list.map((t) => ({ id: Number(t.id), name: String(t.name) })));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed to load templates');
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select variant…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linen">Linen</SelectItem>
                      <SelectItem value="fibrecool">Fibrecool</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-sm font-medium text-muted-foreground">Template</div>
              <Select
                value={sellDrawerTemplateId === '' ? '' : String(sellDrawerTemplateId)}
                onValueChange={(value) => {
                  const next: number | '' = value ? Number(value) : '';
                  setSellDrawerTemplateId(next);
                  if (next === '') { setSellDrawerLines([]); setSellDrawerTemplateName(null); return; }
                  loadSelectedTemplateLines(next).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load template'));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select template…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Select template…</SelectItem>
                  {sellDrawerTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Available: {(() => {
                  if (sellDrawerTemplateId === '') {
                    if (sellDrawerKind === 'pillow') {
                      return sellDrawerPillowKind === 'premium'
                        ? Number(premiumBuildable[sellDrawerSize] ?? 0)
                        : Number(buildable[sellDrawerSize] ?? 0);
                    }
                    const v = sellDrawerBolsterVariant;
                    return v === 'short' ? Number(buildableBolsterShort ?? 0) : v === 'long' ? Number(buildableBolsterLong ?? 0) : Number(buildableBolsterMedium ?? 0);
                  }
                  return computeBuildableFromLines(sellDrawerLines);
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">Qty</div>
              <Input type="number" min={1} value={sellDrawerQty} onChange={(e) => setSellDrawerQty(e.target.value)} className="w-24" />
              <div className="ml-auto" />
            </div>
          </div>
          <SheetFooter>
            <Button
              onClick={() => {
                const qty = Math.max(1, parseInt((sellDrawerQty || '1'), 10));
                const templateId = sellDrawerTemplateId === '' ? null : Number(sellDrawerTemplateId);
                if (!templateId) { toast.error('Select a template'); return; }
                const templateName = (sellDrawerTemplateName ?? null);
                const id = `${sellDrawerKind}:${sellDrawerKind === 'pillow' ? sellDrawerSize : sellDrawerBolsterVariant}:${templateId ?? 'active'}:${Date.now()}`;
                const label = sellDrawerKind === 'pillow'
                  ? `Pillow ${sellDrawerSize}`
                  : `Bolster ${sellDrawerBolsterVariant === 'short' ? 'S (0.8m)' : sellDrawerBolsterVariant === 'long' ? 'L (1.2m)' : 'M (1m)'}`;
                setCart((prev) => ({
                  ...prev,
                  pillows: [
                    ...prev.pillows,
                    {
                      id,
                      kind: sellDrawerKind,
                      label,
                      templateId,
                      templateName,
                      quantity: qty,
                      pillowKind: sellDrawerKind === 'pillow' ? sellDrawerPillowKind : undefined,
                      pillowSize: sellDrawerKind === 'pillow' ? sellDrawerSize : undefined,
                      bolsterVariant: sellDrawerKind === 'bolster' ? sellDrawerBolsterVariant : undefined,
                    },
                  ],
                }));
                toast.success('Added to cart');
                setSellDrawerOpen(false);
              }}
            >
              Add to cart
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AddInventoryDrawer
        open={addDrawerOpen}
        onOpenChange={setAddDrawerOpen}
        onCreate={handleCreateItem}
        items={items}
      />

      {/* Part Drawer */}
      <PartDrawer
        open={partDrawerOpen}
        onOpenChange={setPartDrawerOpen}
        group={partDrawerGroup}
        balances={balances}
        onReceive={onReceive}
        onSell={async (itemId, qty) => {
          if (!qty || qty <= 0) return;
          await sellPart({ itemId, quantity: qty });
          await load();
          toast.success(`Stocked out ${qty} unit(s)`);
        }}
        onSelectVariant={(id) => incrementPartSelection(id)}
        onDelete={handleDeleteItem}
        onRename={handleRenameItem}
      />

      {/* Custom Pillow Drawer */}
      <CustomPillowDrawer
        open={customPillowDrawerOpen}
        onOpenChange={setCustomPillowDrawerOpen}
        size={customPillowSize}
        setSize={setCustomPillowSize}
        items={items}
        lines={customPillowLines}
        setLines={setCustomPillowLines}
        qty={customPillowQty}
        setQty={setCustomPillowQty}
        saving={savingCustomPillow}
        onSell={async () => { await sellCustomPillowFromDrawer(); }}
        onAdd={addCustomPillowToCart}
      />

      {/* Custom Bolster Drawer */}
      <CustomBolsterDrawer
        open={customBolsterDrawerOpen}
        onOpenChange={setCustomBolsterDrawerOpen}
        variant={customBolsterVariant}
        setVariant={setCustomBolsterVariant}
        items={items}
        lines={customBolsterLines}
        setLines={setCustomBolsterLines}
        qty={customBolsterQty}
        setQty={setCustomBolsterQty}
        saving={savingCustomBolster}
        onSell={async () => { await sellCustomBolsterFromDrawer(); }}
        onAdd={addCustomBolsterToCart}
      />
    </div>
  );
}

function AddInventoryDrawer({ open, onOpenChange, onCreate, items }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: AddInventoryDraft) => Promise<void>;
  items: Item[];
}) {
  const [entries, setEntries] = useState<AddInventoryEntry[]>([createDefaultEntry()]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((it) => map.set(it.id, it));
    return map;
  }, [items]);

  const fillingBaseItems = useMemo(() => {
    return items
      .filter((it) => it.category === "filling" && !it.alteration_of_item_id)
      .slice()
      .sort((a, b) => {
        const aKey = `${a.name} ${a.size ?? ""}`.trim();
        const bKey = `${b.name} ${b.size ?? ""}`.trim();
        return aKey.localeCompare(bKey);
      });
  }, [items]);

  const fillingBaseVariantNames = useMemo(() => {
    const names = new Set<string>();
    fillingBaseItems.forEach((it) => {
      const n = String(it.name ?? "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [fillingBaseItems]);

  const fillingSizesByBaseName = useMemo(() => {
    const map = new Map<string, Array<{ id: number; size: string }>>();
    fillingBaseItems.forEach((it) => {
      const base = String(it.name ?? "").trim();
      if (!base) return;
      const size = it.size ? String(it.size).trim().toUpperCase() : "";
      if (!size) return;
      const list = map.get(base) ?? [];
      list.push({ id: it.id, size });
      map.set(base, list);
    });
    for (const [k, list] of map.entries()) {
      const dedup = new Map<string, { id: number; size: string }>();
      list.forEach((row) => {
        if (!dedup.has(row.size)) dedup.set(row.size, row);
      });
      map.set(
        k,
        Array.from(dedup.values()).sort((a, b) => a.size.localeCompare(b.size)),
      );
    }
    return map;
  }, [fillingBaseItems]);

  useEffect(() => {
    if (!open) return;
    setEntries([createDefaultEntry()]);
    setErrorMessage(null);
    setSaving(false);
  }, [open]);

  const parseCurrency = (raw: string): number | undefined | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    const num = Number.parseFloat(trimmed);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
  };

  const handleCategoryChange = (index: number, nextCategory: ItemCategory) => {
    setEntries((prev) =>
      prev.map((entry, idx) => {
        if (idx !== index) return entry;
        const trimmedName = entry.name.trim();
        const defaultName =
          nextCategory === "packaging"
            ? ""
            : nextCategory === "filling"
              ? ""
              : nextCategory;

        let nextSize: string;
        if (SIZED_CATEGORIES.includes(nextCategory)) {
          const normalized = entry.size.trim().toUpperCase();
          const isValid =
            SIZE_OPTIONS.includes(normalized as typeof SIZE_OPTIONS[number]) && normalized !== "-";
          nextSize = isValid ? normalized : "M";
        } else if (nextCategory === "filling") {
          nextSize = "";
        } else {
          nextSize = "-";
        }

        const nextSubtype = nextCategory === "filling" ? "" : entry.subtype;

        return {
          ...entry,
          category: nextCategory,
          name: trimmedName !== "" ? entry.name : defaultName,
          size: nextSize,
          subtype: nextSubtype,
          alterationBaseName: "",
          alterationOfItemId: "",
          alterationName: "",
        };
      }),
    );
    setErrorMessage(null);
  };

  const handleAddEntry = () => {
    if (saving) return;
    setEntries((prev) => [...prev, createDefaultEntry()]);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const payloads: AddInventoryDraft[] = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const baseId = entry.alterationOfItemId.trim() ? Number(entry.alterationOfItemId) : null;
      const baseItem = baseId ? (itemsById.get(baseId) ?? null) : null;
      const computedName =
        entry.category === "filling" && baseItem
          ? `${baseItem.name}${entry.alterationName.trim() ? ` ${entry.alterationName.trim()}` : ""}`
          : "";

      const trimmedName =
        entry.category === "filling"
          ? (baseItem ? computedName.trim() : entry.name.trim())
          : entry.name.trim();
      if (!trimmedName) {
        setErrorMessage(
          entry.category === "filling"
            ? `Item ${index + 1}: Enter a variant name or select an alteration base`
            : `Item ${index + 1}: Name is required`,
        );
        return;
      }

      const trimmedSize = entry.size.trim();
      const normalizedSizeInput = trimmedSize === "-" ? "" : trimmedSize;
      const sizeRequired = SIZED_CATEGORIES.includes(entry.category) || entry.category === "filling";
      if (sizeRequired && !normalizedSizeInput) {
        setErrorMessage(`Item ${index + 1}: Size is required for this category`);
        return;
      }

      const trimmedSubtype = entry.subtype.trim();

      if (entry.category === "filling" && baseItem) {
        const baseSize = (baseItem.size ?? "").trim().toUpperCase();
        const desiredSize = normalizedSizeInput.trim().toUpperCase();
        if (baseSize && desiredSize && baseSize !== desiredSize) {
          setErrorMessage(`Item ${index + 1}: Alteration base must have the same size`);
          return;
        }
      }

      const stockValue = entry.initialStock.trim();
      const stock = stockValue === "" ? 0 : Number.parseInt(stockValue, 10);
      if (!Number.isFinite(stock) || stock < 0) {
        setErrorMessage(`Item ${index + 1}: Initial stock must be a whole number of 0 or greater`);
        return;
      }

      const parsedCost = parseCurrency(entry.costPrice);
      if (parsedCost === null) {
        setErrorMessage(`Item ${index + 1}: Cost price must be a valid number >= 0`);
        return;
      }

      const parsedMsrp = parseCurrency(entry.msrp);
      if (parsedMsrp === null) {
        setErrorMessage(`Item ${index + 1}: MSRP must be a valid number >= 0`);
        return;
      }

      const payload: AddInventoryDraft = {
        category: entry.category,
        name: trimmedName,
        initialStock: stock,
      };

      if (normalizedSizeInput) {
        const shouldUppercase = SIZED_CATEGORIES.includes(entry.category) || entry.category === "filling";
        payload.size = shouldUppercase ? normalizedSizeInput.toUpperCase() : normalizedSizeInput;
      }

      if (trimmedSubtype) {
        payload.subtype = trimmedSubtype;
      }

      if (entry.category === "filling" && baseItem) {
        payload.alterationOfItemId = baseItem.id;
        if (entry.alterationName.trim()) payload.alterationName = entry.alterationName.trim();
      }

      if (parsedCost !== undefined) {
        payload.costPrice = parsedCost;
      }

      if (parsedMsrp !== undefined) {
        payload.msrp = parsedMsrp;
      }

      payloads.push(payload);
    }

    setSaving(true);
    try {
      for (const payload of payloads) {
        await onCreate(payload);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add inventory item";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add inventory item</SheetTitle>
          <SheetDescription>
            Create a new component so it can be tracked in stock and costings.
          </SheetDescription>
        </SheetHeader>
        <form className="mt-4 flex h-full flex-col" onSubmit={handleSubmit}>
          <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
            {entries.map((entry, index) => (
              <div key={`inventory-entry-${index}`} className="space-y-4">
                {entries.length > 1 ? (
                  <p className="text-sm font-semibold text-muted-foreground">
                    Item {index + 1}
                  </p>
                ) : null}
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor={`add-item-category-${index}`}>
                    Category
                  </label>
                  <Select
                    value={entry.category}
                    onValueChange={(value) => handleCategoryChange(index, value as ItemCategory)}
                  >
                    <SelectTrigger id={`add-item-category-${index}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_CATEGORIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {entry.category === "filling" ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor={`add-item-alterations-${index}`}>
                      Alterations
                    </label>
                    <Select
                      value={entry.alterationBaseName}
                      onValueChange={(value) => {
                        setEntries((prev) =>
                          prev.map((item, idx) => {
                            if (idx !== index) return item;
                            if (value === "__none__") {
                              return {
                                ...item,
                                alterationBaseName: "",
                                size: "",
                                alterationOfItemId: "",
                                alterationName: "",
                                name: "",
                              };
                            }
                            if (!value) {
                              return {
                                ...item,
                                alterationBaseName: "",
                                size: "",
                                alterationOfItemId: "",
                                alterationName: "",
                                name: "",
                              };
                            }
                            const nextName = `${value}${item.alterationName.trim() ? ` ${item.alterationName.trim()}` : ""}`.trim();
                            return {
                              ...item,
                              alterationBaseName: value,
                              size: "",
                              alterationOfItemId: "",
                              name: nextName,
                            };
                          }),
                        );
                        setErrorMessage(null);
                      }}
                    >
                      <SelectTrigger id={`add-item-alterations-${index}`} className="w-full">
                        <SelectValue placeholder="Select base variant…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Select base variant…</SelectItem>
                        <SelectItem value="__none__">No alteration</SelectItem>
                        {fillingBaseVariantNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select an existing filling base variant, then choose an available size.
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor={`add-item-name-${index}`}>
                      Variant name
                    </label>
                    <Input
                      id={`add-item-name-${index}`}
                      value={entry.name}
                      disabled={entry.category === "filling" && !!entry.alterationBaseName}
                      onChange={
                        entry.category === "filling" && !!entry.alterationBaseName
                          ? undefined
                          : (event) => {
                              const value = event.target.value;
                              setEntries((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? {
                                        ...item,
                                        name: value,
                                      }
                                    : item,
                                ),
                              );
                              setErrorMessage(null);
                            }
                      }
                      placeholder={
                        entry.category === "packaging"
                          ? "e.g. Tote bag (Premium)"
                          : entry.category === "filling"
                            ? (entry.alterationBaseName ? "Alteration (computed)" : "e.g. 3D")
                          : "e.g. Linen Luxe"
                      }
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the variant name shown alongside category and size.
                    </p>
                  </div>
                  {SIZED_CATEGORIES.includes(entry.category) ? (
                    <div className="space-y-1">
                      <label className="text-sm font-medium" htmlFor={`add-item-size-${index}`}>
                        Size
                      </label>
                      <Select
                        value={entry.size}
                        onValueChange={(value) => {
                          const upper = value.toUpperCase();
                          setEntries((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? {
                                    ...item,
                                    size: upper,
                                  }
                                : item,
                            ),
                          );
                          setErrorMessage(null);
                        }}
                      >
                        <SelectTrigger id={`add-item-size-${index}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    entry.category === "filling" ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor={`add-item-size-${index}`}>
                            Size
                          </label>
                          {entry.alterationBaseName ? (
                            <Select
                              value={entry.size}
                              onValueChange={(value) => {
                                setEntries((prev) =>
                                  prev.map((item, idx) => {
                                    if (idx !== index) return item;
                                    const baseName = item.alterationBaseName.trim();
                                    const rows = baseName ? (fillingSizesByBaseName.get(baseName) ?? []) : [];
                                    const match = rows.find((r) => r.size === value) ?? null;
                                    const nextName = `${baseName}${item.alterationName.trim() ? ` ${item.alterationName.trim()}` : ""}`.trim();
                                    return {
                                      ...item,
                                      size: value,
                                      alterationOfItemId: match ? String(match.id) : "",
                                      name: nextName,
                                    };
                                  }),
                                );
                                setErrorMessage(null);
                              }}
                            >
                              <SelectTrigger id={`add-item-size-${index}`} className="w-full">
                                <SelectValue placeholder="Select size…" />
                              </SelectTrigger>
                              <SelectContent>
                                {(fillingSizesByBaseName.get(entry.alterationBaseName) ?? []).map((row) => (
                                  <SelectItem key={row.size} value={row.size}>
                                    {row.size}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`add-item-size-${index}`}
                              value={entry.size}
                              onChange={(event) => {
                                const value = event.target.value;
                                setEntries((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index
                                      ? {
                                          ...item,
                                          size: value,
                                        }
                                      : item,
                                  ),
                                );
                                setErrorMessage(null);
                              }}
                              placeholder="e.g. S, M, L"
                              autoComplete="off"
                            />
                          )}
                        </div>
                        {entry.alterationBaseName ? (
                          <div className="space-y-1">
                            <label className="text-sm font-medium" htmlFor={`add-item-alteration-name-${index}`}>
                              Alteration name
                            </label>
                            <Input
                              id={`add-item-alteration-name-${index}`}
                              value={entry.alterationName}
                              onChange={(event) => {
                                const value = event.target.value;
                                setEntries((prev) =>
                                  prev.map((item, idx) => {
                                    if (idx !== index) return item;
                                    const baseName = item.alterationBaseName.trim();
                                    const nextName = `${baseName}${value.trim() ? ` ${value.trim()}` : ""}`.trim();
                                    return {
                                      ...item,
                                      alterationName: value,
                                      name: nextName,
                                    };
                                  }),
                                );
                                setErrorMessage(null);
                              }}
                              placeholder="e.g. Round"
                              autoComplete="off"
                            />
                            <p className="text-xs text-muted-foreground">Appends to the base variant name.</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor={`add-item-size-${index}`}>
                          Size{" "}
                          <span className="text-xs text-muted-foreground">
                            (optional)
                          </span>
                        </label>
                        <Input
                          id={`add-item-size-${index}`}
                          value={entry.size}
                          onChange={(event) => {
                            const value = event.target.value;
                            setEntries((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? {
                                      ...item,
                                      size: value,
                                    }
                                  : item,
                              ),
                            );
                            setErrorMessage(null);
                          }}
                          placeholder={
                            entry.category === "packaging"
                              ? "e.g. S, L, Bolster"
                              : 'Leave blank or "-" if not applicable'
                          }
                          autoComplete="off"
                        />
                      </div>
                    )
                  )}
                </div>
                {entry.category !== "filling" ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor={`add-item-subtype-${index}`}>
                      Subtype (optional)
                    </label>
                    <Input
                      id={`add-item-subtype-${index}`}
                      value={entry.subtype}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEntries((prev) =>
                          prev.map((item, idx) =>
                            idx === index
                              ? {
                                  ...item,
                                  subtype: value,
                                }
                              : item,
                          ),
                        );
                        setErrorMessage(null);
                      }}
                      placeholder="Variant or descriptor"
                      autoComplete="off"
                    />
                  </div>
                ) : null}
                <Separator />
                {entry.category === "filling" ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor={`add-item-msrp-${index}`}>
                      MSRP <span className="text-xs text-muted-foreground">(optional)</span>
                    </label>
                    <Input
                      id={`add-item-msrp-${index}`}
                      type="number"
                      min={0}
                      step={0.01}
                      inputMode="decimal"
                      value={entry.msrp}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEntries((prev) =>
                          prev.map((item, idx) =>
                            idx === index
                              ? {
                                  ...item,
                                  msrp: value,
                                }
                              : item,
                          ),
                        );
                        setErrorMessage(null);
                      }}
                      placeholder="0.00"
                      autoComplete="off"
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label
                        className="text-sm font-medium"
                        htmlFor={`add-item-initial-stock-${index}`}
                      >
                        Initial stock <span className="text-xs text-muted-foreground">(optional)</span>
                      </label>
                      <Input
                        id={`add-item-initial-stock-${index}`}
                        type="number"
                        min={0}
                        step={1}
                        value={entry.initialStock}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEntries((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? {
                                    ...item,
                                    initialStock: value,
                                  }
                                : item,
                            ),
                          );
                          setErrorMessage(null);
                        }}
                        placeholder="0"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium" htmlFor={`add-item-cost-${index}`}>
                        Cost price <span className="text-xs text-muted-foreground">(USD)</span>
                      </label>
                      <Input
                        id={`add-item-cost-${index}`}
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        value={entry.costPrice}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEntries((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? {
                                    ...item,
                                    costPrice: value,
                                  }
                                : item,
                            ),
                          );
                          setErrorMessage(null);
                        }}
                        placeholder="0.00"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium" htmlFor={`add-item-msrp-${index}`}>
                        MSRP <span className="text-xs text-muted-foreground">(optional)</span>
                      </label>
                      <Input
                        id={`add-item-msrp-${index}`}
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        value={entry.msrp}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEntries((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? {
                                    ...item,
                                    msrp: value,
                                  }
                                : item,
                            ),
                          );
                          setErrorMessage(null);
                        }}
                        placeholder="0.00"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {errorMessage && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            )}
          </div>
          <SheetFooter>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddEntry}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                Add more
              </Button>
              <Button type="submit" disabled={saving} className="w-full sm:flex-1">
                {saving ? "Saving…" : entries.length > 1 ? "Create items" : "Create item"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* (moved) Shopify Admin is now a full page at /settings/inventory/shopify
function ShopifyAdminDrawer({ open, onOpenChange, items, onSynced }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  onSynced: () => Promise<void>;
}) {
  type AdminRow = {
    shopifyVariantId: number;
    kind: "pillow" | "bolster" | "part";
    pillowSize: string | null;
    pillowKind: string | null;
    bolsterVariant: string | null;
    item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
    notes: string | null;
    override: { sku: string | null; price: string | number | null; compare_at_price: string | number | null; currency: string | null } | null;
  };

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [filter, setFilter] = useState("");

  const [linkItemId, setLinkItemId] = useState<string>("");
  const [linkVariantId, setLinkVariantId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  const [draftByVariantId, setDraftByVariantId] = useState<Record<number, { sku: string; price: string; compareAt: string }>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listShopifyAdminState();
      if (!res?.ok) throw new Error("Failed to load Shopify admin state");
      const next = (res.rows ?? []) as AdminRow[];
      setRows(next);
      setDraftByVariantId(() => {
        const out: Record<number, { sku: string; price: string; compareAt: string }> = {};
        next.forEach((r) => {
          out[r.shopifyVariantId] = {
            sku: r.override?.sku ?? "",
            price: r.override?.price === null || r.override?.price === undefined ? "" : String(r.override?.price),
            compareAt:
              r.override?.compare_at_price === null || r.override?.compare_at_price === undefined
                ? ""
                : String(r.override?.compare_at_price),
          };
        });
        return out;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Shopify admin state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const parts = [
        String(r.shopifyVariantId),
        r.kind,
        r.pillowKind ?? "",
        r.pillowSize ?? "",
        r.bolsterVariant ?? "",
        r.item?.category ?? "",
        r.item?.name ?? "",
        r.item?.size ?? "",
        r.item?.subtype ?? "",
        r.override?.sku ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return parts.includes(q);
    });
  }, [rows, filter]);

  const itemOptions = useMemo(() => {
    const sorted = [...items].sort((a, b) => getInventoryItemDisplayLabel(a).localeCompare(getInventoryItemDisplayLabel(b)));
    return sorted.map((it) => ({ id: it.id, label: getInventoryItemDisplayLabel(it) }));
  }, [items]);

  const parseMoney = (raw: string): number | null | undefined => {
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Shopify Admin</SheetTitle>
          <SheetDescription>
            Manage Shopify variant mappings and per-variant overrides (SKU/price/compare-at). Then press “Sync Shopify”.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <div className="flex items-center gap-2">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by variantId, SKU, item name…" />
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-sm font-medium">Link a part item to a Shopify variant</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Inventory item</div>
                <Select value={linkItemId} onValueChange={setLinkItemId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select item…" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemOptions.map((opt) => (
                      <SelectItem key={opt.id} value={String(opt.id)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Shopify variant ID</div>
                <Input value={linkVariantId} onChange={(e) => setLinkVariantId(e.target.value)} placeholder="e.g. 31003477114976" />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  disabled={linking}
                  onClick={async () => {
                    if (!linkItemId || !linkVariantId) {
                      toast.message("Select an item and enter a Shopify variant ID");
                      return;
                    }
                    setLinking(true);
                    try {
                      await linkPartToShopifyVariant({ itemId: Number(linkItemId), shopifyVariantId: Number(linkVariantId) });
                      toast.success("Linked");
                      setLinkItemId("");
                      setLinkVariantId("");
                      await refresh();
                      await onSynced();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to link");
                    } finally {
                      setLinking(false);
                    }
                  }}
                >
                  {linking ? "Linking…" : "Link"}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Mapping</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price (SGD)</TableHead>
                  <TableHead>Compare-at (SGD)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const d = draftByVariantId[r.shopifyVariantId] ?? { sku: "", price: "", compareAt: "" };
                  const mappingLabel =
                    r.kind === "part"
                      ? r.item
                        ? `${r.item.category} — ${r.item.name}${r.item.size ? ` (${r.item.size})` : ""}${r.item.subtype ? ` — ${r.item.subtype}` : ""}`
                        : "part"
                      : r.kind === "pillow"
                        ? `${r.pillowKind ?? "basic"} / ${r.pillowSize ?? ""}`
                        : `bolster / ${r.bolsterVariant ?? ""}`;

                  return (
                    <TableRow key={r.shopifyVariantId}>
                      <TableCell className="font-mono text-xs">{r.shopifyVariantId}</TableCell>
                      <TableCell className="text-xs">{mappingLabel}</TableCell>
                      <TableCell>
                        <Input
                          value={d.sku}
                          onChange={(e) =>
                            setDraftByVariantId((prev) => ({
                              ...prev,
                              [r.shopifyVariantId]: { ...d, sku: e.target.value },
                            }))
                          }
                          placeholder="(optional)"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.price}
                          onChange={(e) =>
                            setDraftByVariantId((prev) => ({
                              ...prev,
                              [r.shopifyVariantId]: { ...d, price: e.target.value },
                            }))
                          }
                          placeholder="(optional)"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.compareAt}
                          onChange={(e) =>
                            setDraftByVariantId((prev) => ({
                              ...prev,
                              [r.shopifyVariantId]: { ...d, compareAt: e.target.value },
                            }))
                          }
                          placeholder="(optional)"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              const price = parseMoney(d.price);
                              const compareAt = parseMoney(d.compareAt);
                              if (price === null) { toast.error("Invalid price"); return; }
                              if (compareAt === null) { toast.error("Invalid compare-at"); return; }
                              try {
                                await upsertShopifyVariantOverride({
                                  shopifyVariantId: r.shopifyVariantId,
                                  sku: d.sku.trim() ? d.sku.trim() : null,
                                  price: price === undefined ? undefined : price,
                                  compareAtPrice: compareAt === undefined ? undefined : compareAt,
                                });
                                toast.success("Saved");
                                await refresh();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Failed to save");
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await deleteShopifyVariantOverride(r.shopifyVariantId);
                                toast.success("Override cleared");
                                setDraftByVariantId((prev) => ({ ...prev, [r.shopifyVariantId]: { sku: "", price: "", compareAt: "" } }));
                                await refresh();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Failed to clear override");
                              }
                            }}
                          >
                            Clear
                          </Button>
                          {r.kind === "part" ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={async () => {
                                try {
                                  await deleteShopifyMapping(r.shopifyVariantId);
                                  toast.success("Mapping deleted");
                                  await refresh();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed to delete mapping");
                                }
                              }}
                            >
                              Unlink
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      No rows
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
*/

function PartDrawer({ open, onOpenChange, group, balances, onReceive, onSell, onSelectVariant, onDelete, onRename }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group | null;
  balances: Record<number, number>;
  onReceive: (itemId: number, qty: number) => Promise<void>;
  onSell: (itemId: number, qty: number) => Promise<void>;
  onSelectVariant: (itemId: number) => void;
  onDelete: (itemId: number) => Promise<void>;
  onRename: (itemId: number, name: string) => Promise<void>;
}) {
  const [qtyByItem, setQtyByItem] = useState<Record<number, string>>({});
  const [outQtyByItem, setOutQtyByItem] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const sortedVariants = useMemo(() => {
    const list: Item[] = group?.items ?? [];
    if (!group) return list;
    if (group.title !== 'Fillings') return list;

    const parseGrade = (subtype: string): string => {
      const s = String(subtype || '').trim();
      const m = s.match(/^(3D|6D\+|6D)\s*\(/);
      return m ? m[1] : s;
    };
    const parseSuffix = (subtype: string): string => {
      const s = String(subtype || '').trim();
      const m = s.match(/^.*\(([^)]+)\)\s*$/);
      return m ? m[1] : '';
    };

    const gradeOrder = (g: string) => {
      if (g === '3D') return 0;
      if (g === '6D') return 1;
      if (g === '6D+') return 2;
      return 9;
    };
    const suffixOrder = (s: string) => {
      if (s === 'S') return 0;
      if (s === 'M') return 1;
      if (s === 'L') return 2;
      if (s === 'L+') return 3;
      if (s === 'XL') return 4;
      if (s === 'Round') return 5;
      if (s === 'Folded') return 6;
      return 9;
    };

    return [...list].sort((a, b) => {
      const as = String(a.subtype ?? a.name ?? '');
      const bs = String(b.subtype ?? b.name ?? '');
      const ga = parseGrade(as);
      const gb = parseGrade(bs);
      const go = gradeOrder(ga) - gradeOrder(gb);
      if (go !== 0) return go;
      const sa = parseSuffix(as);
      const sb = parseSuffix(bs);
      return suffixOrder(sa) - suffixOrder(sb);
    });
  }, [group]);

  const variantsGroupedByName = useMemo(() => {
    const list = sortedVariants;
    const groupsMap = new Map<string, Item[]>();
    const order: string[] = [];

    for (const variant of list) {
      const nameKey = getInventoryVariantName(variant).trim() || "Item";
      if (!groupsMap.has(nameKey)) order.push(nameKey);
      const bucket = groupsMap.get(nameKey) ?? [];
      bucket.push(variant);
      groupsMap.set(nameKey, bucket);
    }

    return order.map((name) => {
      const variants = groupsMap.get(name) ?? [];
      const totalOnHand = variants.reduce((sum, v) => sum + (balances[v.id] ?? 0), 0);
      return { name, variants, totalOnHand };
    });
  }, [sortedVariants, balances]);

  useEffect(() => {
    if (renamingId === null) return;
    if (!sortedVariants.some((variant) => variant.id === renamingId)) {
      setRenamingId(null);
      setRenameValue("");
      setRenameError(null);
    }
  }, [sortedVariants, renamingId]);

  const saveRename = async (itemId: number) => {
    const variant = sortedVariants.find((entry) => entry.id === itemId);
    if (!variant) {
      setRenamingId(null);
      setRenameValue("");
      setRenameError(null);
      return;
    }
    const nextName = renameValue.trim();
    if (nextName === "") {
      setRenameError("Name is required");
      return;
    }
    const currentName = (variant.name?.trim() ?? "") || getInventoryVariantName(variant);
    if (nextName === currentName) {
      setRenamingId(null);
      setRenameValue("");
      setRenameError(null);
      return;
    }
    setRenameSaving(true);
    try {
      await onRename(itemId, nextName);
      toast.success("Item renamed");
      setRenamingId(null);
      setRenameValue("");
      setRenameError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rename item";
      setRenameError(message);
      toast.error(message);
    } finally {
      setRenameSaving(false);
    }
  };

  const onSaveAll = async () => {
    const entriesIn = Object.entries(qtyByItem)
      .map(([id, raw]) => ({ id: Number(id), qty: parseInt((raw || '0'), 10) }))
      .filter(e => e.qty > 0);
    const entriesOut = Object.entries(outQtyByItem)
      .map(([id, raw]) => ({ id: Number(id), qty: parseInt((raw || '0'), 10) }))
      .filter(e => e.qty > 0);
    if (entriesIn.length === 0 && entriesOut.length === 0) return;
    setSaving(true);
    try {
      for (const e of entriesIn) await onReceive(e.id, e.qty);
      for (const e of entriesOut) await onSell(e.id, e.qty);
      setQtyByItem({});
      setOutQtyByItem({});
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasPositive =
    Object.values(qtyByItem).some(v => (parseInt((v || '0'), 10) > 0)) ||
    Object.values(outQtyByItem).some(v => (parseInt((v || '0'), 10) > 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{group?.title ?? 'Part'}</SheetTitle>
          <SheetDescription>Enter stock in/out quantities per variant.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-4">
          {variantsGroupedByName.map(({ name, variants, totalOnHand }) => (
            <Collapsible key={`${group?.key ?? "group"}:${name}`} defaultOpen>
              <div className="rounded border">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-semibold">{name}</div>
                        {variants.some((variant) => Boolean(variant.alteration_of_item_id)) ? (
                          <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Alteration
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {variants.length} item{variants.length === 1 ? "" : "s"} • On hand: {totalOnHand}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 border-t p-3">
                    {variants.map((variant) => {
                      const labelParts = getInventoryItemLabelParts(variant);
                      const description = getInventoryItemDisplayLabel(variant);
                      const defaultRenameValue = variant.name?.trim() ? variant.name.trim() : labelParts.variant;
                      const balanceId =
                        variant.category === "filling" && variant.alteration_of_item_id
                          ? variant.alteration_of_item_id
                          : variant.id;
                      const onHand = balances[balanceId] ?? 0;
                      const isRenaming = renamingId === variant.id;
                      return (
                        <div key={variant.id} className="group relative rounded border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              {isRenaming ? (
                                <>
                                  <Input
                                    value={renameValue}
                                    onChange={(event) => {
                                      setRenameValue(event.target.value);
                                      if (renameError) setRenameError(null);
                                    }}
                                    placeholder={labelParts.variant}
                                    autoFocus
                                  />
                                  <div className="mt-1 text-xs text-muted-foreground">Current display</div>
                                  <InventoryItemLabel item={variant} className="mt-1" />
                                  {renameError && (
                                    <div className="mt-1 text-xs text-destructive">{renameError}</div>
                                  )}
                                </>
                              ) : (
                                <InventoryItemLabel item={variant} />
                              )}
                              <div className="mt-1 text-xs text-muted-foreground">On hand: {onHand}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isRenaming ? (
                                <>
                                  <Button size="sm" onClick={() => saveRename(variant.id)} disabled={renameSaving}>
                                    {renameSaving ? "Saving…" : "Save"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setRenamingId(null);
                                      setRenameValue("");
                                      setRenameError(null);
                                    }}
                                    disabled={renameSaving}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setRenamingId(variant.id);
                                      setRenameValue(defaultRenameValue);
                                      setRenameError(null);
                                    }}
                                    disabled={renameSaving}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => onSelectVariant(variant.id)}
                                    disabled={renameSaving}
                                  >
                                    Add
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          {variant.category === "filling" && variant.alteration_of_item_id ? (
                            <div className="mt-3 text-xs text-muted-foreground">
                              Stock is tracked on the base filling variant.
                            </div>
                          ) : (
                            <div className="mt-3 flex items-center gap-3 pr-10">
                              <Input
                                type="number"
                                placeholder="In"
                                min={0}
                                value={qtyByItem[variant.id] ?? ''}
                                onChange={(e) => setQtyByItem(prev => ({ ...prev, [variant.id]: e.target.value }))}
                                className="w-28"
                              />
                              <Input
                                type="number"
                                placeholder="Out"
                                min={0}
                                value={outQtyByItem[variant.id] ?? ''}
                                onChange={(e) => setOutQtyByItem(prev => ({ ...prev, [variant.id]: e.target.value }))}
                                className="w-28"
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-border bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition hover:text-destructive focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:pointer-events-auto group-hover:opacity-100 disabled:opacity-50"
                            aria-label={`Delete ${description}`}
                            disabled={deletingId === variant.id}
                            onClick={async (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const confirmed = typeof window === 'undefined' ? true : window.confirm(`Delete ${description}? This cannot be undone.`);
                              if (!confirmed) return;
                              setDeletingId(variant.id);
                              try {
                                await onDelete(variant.id);
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
        <SheetFooter>
          <div className="flex w-full gap-2">
            <Button onClick={onSaveAll} disabled={!hasPositive || saving} className="flex-1">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CustomPillowDrawer({ open, onOpenChange, size, setSize, items, lines, setLines, qty, setQty, saving, onSell, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size: string;
  setSize: (s: string) => void;
  items: Item[];
  lines: Array<{ item_id: number; quantity: number }>;
  setLines: Dispatch<SetStateAction<Array<{ item_id: number; quantity: number }>>>;
  qty: string;
  setQty: (v: string) => void;
  saving: boolean;
  onSell: () => Promise<void>;
  onAdd: () => Promise<void> | void;
}) {
  const sized = (category: string) => items.filter(i => i.category===category && i.size===size);
  const fillings = items.filter(i => i.category==='filling');
  const packaging = items.filter(i => i.category==='packaging' && ((size==='XS'||size==='S'||size==='M') ? i.size==='S' : i.size==='L'));

  const upsert = (item_id: number, quantity: number) => {
    setLines((prev: Array<{ item_id: number; quantity: number }>) => {
      const idx = prev.findIndex(l => l.item_id===item_id);
      if (idx === -1) return [...prev, { item_id, quantity }];
      return prev.map((l) => l.item_id===item_id ? { ...l, quantity } : l);
    });
  };

  const remove = (item_id: number) => {
    setLines((prev: Array<{ item_id: number; quantity: number }>) => prev.filter(l => l.item_id!==item_id));
  };

  const getQty = (item_id: number) => lines.find(l=>l.item_id===item_id)?.quantity ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Custom pillow</SheetTitle>
          <SheetDescription>Choose size, adjust parts and packaging, then sell.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="custom-pillow-size">Size</label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger id="custom-pillow-size" aria-label="Custom pillow size" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['XS','S','M','L','XL'].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Qty</span>
              <Input type="number" min={0} placeholder="Qty" value={qty} onChange={(e)=> setQty(e.target.value)} className="w-24" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Cover (1)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('cover').map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Pillow Case (1)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('case').map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Pillow protector (1)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('protector').map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Fillings</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fillings.map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> {
                        const v = Math.max(0, parseInt(e.target.value||'0',10));
                        if (v===0) remove(it.id); else upsert(it.id, v);
                      }} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> remove(it.id)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Packaging (1 vacuum + 1 net)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packaging.map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <SheetFooter>
          <div className="flex w-full gap-2">
            <Button onClick={onSell} disabled={saving} className="flex-1">{saving ? 'Selling…' : 'Sell'}</Button>
            <Button onClick={onAdd} variant="secondary" className="w-28" aria-label="Add to cart">Add another</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CustomBolsterDrawer({ open, onOpenChange, variant, setVariant, items, lines, setLines, qty, setQty, saving, onSell, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: 'short'|'medium'|'long';
  setVariant: (v: 'short'|'medium'|'long') => void;
  items: Item[];
  lines: Array<{ item_id: number; quantity: number }>;
  setLines: Dispatch<SetStateAction<Array<{ item_id: number; quantity: number }>>>;
  qty: string;
  setQty: (v: string) => void;
  saving: boolean;
  onSell: () => Promise<void>;
  onAdd: () => Promise<void> | void;
}) {
  const sized = (category: string) => items.filter(i => i.category===category && i.size==='Bolster');
  const fillings = items.filter(i => i.category==='filling' && i.subtype==='6D (L)');
  const packaging = items.filter(i => i.category==='packaging' && i.size==='S');

  const upsert = (item_id: number, quantity: number) => {
    setLines((prev: Array<{ item_id: number; quantity: number }>) => {
      const idx = prev.findIndex(l => l.item_id===item_id);
      if (idx === -1) return [...prev, { item_id, quantity }];
      return prev.map((l) => l.item_id===item_id ? { ...l, quantity } : l);
    });
  };

  const remove = (item_id: number) => {
    setLines((prev: Array<{ item_id: number; quantity: number }>) => prev.filter(l => l.item_id!==item_id));
  };

  const getQty = (item_id: number) => lines.find(l=>l.item_id===item_id)?.quantity ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Custom bolster</SheetTitle>
          <SheetDescription>Choose variant, adjust parts and packaging, then sell.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="custom-bolster-variant">Variant</label>
            <Select value={variant} onValueChange={(value) => setVariant(value as 'short' | 'medium' | 'long')}>
              <SelectTrigger id="custom-bolster-variant" aria-label="Custom bolster variant" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short (0.8m)</SelectItem>
                <SelectItem value="medium">Medium (1m)</SelectItem>
                <SelectItem value="long">Long (1.2m)</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Qty</span>
              <Input type="number" min={0} placeholder="Qty" value={qty} onChange={(e)=> setQty(e.target.value)} className="w-24" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Case (Bolster)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('case').map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Protector (Bolster)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('protector').map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Fillings (6D-L)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fillings.map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> {
                        const v = Math.max(0, parseInt(e.target.value||'0',10));
                        if (v===0) remove(it.id); else upsert(it.id, v);
                      }} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> remove(it.id)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Packaging (1 vacuum + 1 net typical)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[140px]">Qty</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packaging.map(it => (
                  <TableRow key={it.id}>
                    <TableCell><InventoryItemLabel item={it} /></TableCell>
                    <TableCell className="w-[140px]">
                      <Input type="number" min={0} value={getQty(it.id)} onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
                    </TableCell>
                    <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <SheetFooter>
          <div className="flex w-full gap-2">
            <Button onClick={onSell} disabled={saving} className="flex-1">{saving ? 'Selling…' : 'Sell'}</Button>
            <Button onClick={onAdd} variant="secondary" className="w-28" aria-label="Add to cart">Add another</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
