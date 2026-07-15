"use client";

import { useCallback, useEffect, useMemo, useState, Fragment, type Dispatch, type SetStateAction } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupShopifyTemplatesByKey, type ShopifyTemplateOption } from "@/lib/inventory/shopify-templates-by-key";
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
import {
  listShopifySalesQueue,
  listShopifySalesQueueArchived,
  commitShopifySales,
  refreshShopifySalesQueueFromShopify,
} from "@/app/[lang]/settings/inventory/actions";
import { toast } from "sonner";
import { groupShopifyQueueByOrder } from "@/lib/shopify/shopify-sales-queue-group";
import { resolveShopifyQueueLineMsrp, parseReplaceLinesFromMetadata, sumReplaceLinesMsrp } from "@/lib/shopify/queue-line-price";
import { formatCurrency } from "@/lib/i18n/currencies";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DateRange } from "react-day-picker";
import {
  InventoryItemLabel,
  getInventoryItemDisplayLabel,
} from "@/app/[lang]/settings/inventory/item-label";

const ITEM_CATEGORIES = [
  "cover",
  "pillow_case",
  "pillow_protector",
  "bolster_case",
  "bolster_protector",
  "filling",
  "packaging",
  "accessories",
  "other",
] as const;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];
const CATEGORY_TITLES: Record<ItemCategory, string> = {
  cover: "Covers",
  pillow_case: "Pillow Cases",
  pillow_protector: "Pillow Protectors",
  bolster_case: "Bolster Cases",
  bolster_protector: "Bolster Protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

type Item = {
  id: number;
  category: ItemCategory;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
  alteration_name: string | null;
};
type Product = { id: number; size: string; kind: "basic" | "premium" };

const PAGE_SIZE_SHOPIFY_SALES = 100;
const SHOPIFY_REPLACE_SELECT_VALUE = "__replace__";
type ShopifyTemplateChoice = number | "" | "replace";
type ShopifyReplaceLine = { item_id: number; quantity: number };
type ShopifyQueueCommit = {
  queueId: number;
  templateId: number | null;
  replaceLines?: ShopifyReplaceLine[];
};

type ShopifyQueueRow = {
  id: number;
  shopify_order_id: number;
  shopify_order_name: string | null;
  shopify_order_created_at: string | null;
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
  metadata: unknown;
};

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

function notifyInventoryChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("inventory:changed"));
  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("inventory:changed");
      channel.postMessage("refresh");
      channel.close();
    }
  } catch {
    // ignore
  }
}

function normalizeQueueRow(r: ShopifyQueueRow): ShopifyQueueRow {
  return {
    id: Number(r.id),
    shopify_order_id: Number(r.shopify_order_id),
    shopify_order_name: r.shopify_order_name ?? null,
    shopify_order_created_at: r.shopify_order_created_at ?? null,
    shopify_line_item_id: r.shopify_line_item_id === null ? null : Number(r.shopify_line_item_id),
    shopify_variant_id: r.shopify_variant_id === null ? null : Number(r.shopify_variant_id),
    kind: r.kind,
    pillow_size: r.pillow_size ?? null,
    pillow_kind:
      (r as { pillow_kind?: string | null }).pillow_kind === "premium"
        ? "premium"
        : (r as { pillow_kind?: string | null }).pillow_kind === "basic"
          ? "basic"
          : null,
    bolster_variant: r.bolster_variant ?? null,
    item_id: r.item_id === null ? null : Number(r.item_id),
    quantity: Number(r.quantity),
    variant_title: r.variant_title ?? null,
    sku: r.sku ?? null,
    created_at: String(r.created_at),
    chosen_template_id: r.chosen_template_id === null ? null : Number(r.chosen_template_id),
    fulfillment_status: (r as { fulfillment_status?: string | null }).fulfillment_status ?? null,
    metadata: (r as { metadata?: unknown }).metadata ?? null,
  };
}

export function ShopifySalesSection() {
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shopifyQueue, setShopifyQueue] = useState<ShopifyQueueRow[]>([]);
  const [shopifyQueueArchived, setShopifyQueueArchived] = useState<ShopifyQueueRow[]>([]);
  const [bomTemplateRows, setBomTemplateRows] = useState<
    Array<{
      id: number | string;
      name: string;
      kind: string;
      key: string;
      pillow_kind?: string | null;
      pillow_variant?: string | null;
    }>
  >([]);
  const [shopifyTemplateChoice, setShopifyTemplateChoice] = useState<Record<number, ShopifyTemplateChoice>>({});
  const [shopifyReplaceLines, setShopifyReplaceLines] = useState<Record<number, ShopifyReplaceLine[]>>({});
  const [shopifyReplaceDrawerRowId, setShopifyReplaceDrawerRowId] = useState<number | null>(null);
  const [shopifyReplaceDraftLines, setShopifyReplaceDraftLines] = useState<ShopifyReplaceLine[]>([]);
  const [shopifyProductMsrpByKey, setShopifyProductMsrpByKey] = useState<Record<string, number | string | null>>({});
  const [shopifyItemMsrpById, setShopifyItemMsrpById] = useState<Record<number, number | string | null>>({});
  const [loadingShopifySales, setLoadingShopifySales] = useState(false);
  const [savingShopifySales, setSavingShopifySales] = useState(false);
  const [shopifySalesTab, setShopifySalesTab] = useState<"active" | "archived">("active");
  const [shopifySalesSearch, setShopifySalesSearch] = useState<string>("");
  const [shopifyRefreshRange, setShopifyRefreshRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  });
  const [shopifyRefreshLimit, setShopifyRefreshLimit] = useState<number>(250);
  const [shopifyActivePage, setShopifyActivePage] = useState(1);
  const [shopifyArchivedPage, setShopifyArchivedPage] = useState(1);

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((it) => map.set(it.id, it));
    return map;
  }, [items]);

  const normalizedShopifySalesSearch = useMemo(() => shopifySalesSearch.trim().toLowerCase(), [shopifySalesSearch]);
  const normalizedShopifySalesDigits = useMemo(
    () => shopifySalesSearch.replace(/\D/g, "").trim(),
    [shopifySalesSearch],
  );
  const matchesShopifySalesSearch = useCallback(
    (row: ShopifyQueueRow) => {
      if (!normalizedShopifySalesSearch) return true;
      const name = (row.shopify_order_name ?? "").toLowerCase();
      if (name.includes(normalizedShopifySalesSearch)) return true;
      if (normalizedShopifySalesDigits && String(row.shopify_order_id).includes(normalizedShopifySalesDigits)) {
        return true;
      }
      return false;
    },
    [normalizedShopifySalesSearch, normalizedShopifySalesDigits],
  );
  const filteredShopifyQueue = useMemo(() => {
    if (!normalizedShopifySalesSearch) return shopifyQueue;
    return shopifyQueue.filter(matchesShopifySalesSearch);
  }, [normalizedShopifySalesSearch, shopifyQueue, matchesShopifySalesSearch]);
  const filteredShopifyQueueArchived = useMemo(() => {
    if (!normalizedShopifySalesSearch) return shopifyQueueArchived;
    return shopifyQueueArchived.filter(matchesShopifySalesSearch);
  }, [normalizedShopifySalesSearch, shopifyQueueArchived, matchesShopifySalesSearch]);

  const groupedShopifyQueue = useMemo(
    () => groupShopifyQueueByOrder(filteredShopifyQueue),
    [filteredShopifyQueue],
  );
  const groupedShopifyQueueArchived = useMemo(
    () => groupShopifyQueueByOrder(filteredShopifyQueueArchived),
    [filteredShopifyQueueArchived],
  );

  useEffect(() => {
    setShopifyActivePage(1);
    setShopifyArchivedPage(1);
  }, [normalizedShopifySalesSearch]);

  const pagedShopifyOrderGroups = useMemo(() => {
    const start = (shopifyActivePage - 1) * PAGE_SIZE_SHOPIFY_SALES;
    return groupedShopifyQueue.slice(start, start + PAGE_SIZE_SHOPIFY_SALES);
  }, [groupedShopifyQueue, shopifyActivePage]);
  const pagedShopifyOrderGroupsArchived = useMemo(() => {
    const start = (shopifyArchivedPage - 1) * PAGE_SIZE_SHOPIFY_SALES;
    return groupedShopifyQueueArchived.slice(start, start + PAGE_SIZE_SHOPIFY_SALES);
  }, [groupedShopifyQueueArchived, shopifyArchivedPage]);

  const renderPagination = (args: { total: number; page: number; setPage: (n: number) => void }) => {
    const totalPages = Math.max(1, Math.ceil(args.total / PAGE_SIZE_SHOPIFY_SALES));
    if (args.total <= PAGE_SIZE_SHOPIFY_SALES) return null;

    const page = Math.min(Math.max(1, args.page), totalPages);
    const go = (p: number) => args.setPage(Math.min(Math.max(1, p), totalPages));
    const mkHref = (p: number) => `#shopify-sales-page-${p}`;

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

  const loadShopifySalesQueue = useCallback(async () => {
    setLoadingShopifySales(true);
    try {
      const payload = await listShopifySalesQueue();
      const rows = (payload.rows ?? []) as ShopifyQueueRow[];
      const normalized = rows.map(normalizeQueueRow);
      setShopifyQueue(normalized);
      setShopifyReplaceLines((prev) => {
        const next = { ...prev };
        normalized.forEach((row) => {
          const lines = parseReplaceLinesFromMetadata(row.metadata);
          if (lines) next[row.id] = lines;
        });
        return next;
      });
      setShopifyTemplateChoice((prev) => {
        const next = { ...prev };
        normalized.forEach((row) => {
          if (row.kind === "pillow" || row.kind === "bolster") {
            if (next[row.id] === undefined) {
              const replaceLines = parseReplaceLinesFromMetadata(row.metadata);
              next[row.id] = replaceLines ? "replace" : (row.chosen_template_id ?? "");
            }
          }
        });
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Shopify sales");
    } finally {
      setLoadingShopifySales(false);
    }
  }, []);

  const loadShopifySalesQueueArchived = useCallback(async () => {
    setLoadingShopifySales(true);
    try {
      const payload = await listShopifySalesQueueArchived();
      const rows = (payload.rows ?? []) as ShopifyQueueRow[];
      setShopifyQueueArchived(rows.map(normalizeQueueRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load archived Shopify sales");
    } finally {
      setLoadingShopifySales(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: itemsData }, { data: productsData }, { data: productPrices }, { data: itemPrices }, { data: templates }] =
        await Promise.all([
          supabaseClient
            .from("items")
            .select("id,category,subtype,name,size,alteration_of_item_id,alteration_name")
            .eq("is_active", true),
          supabaseClient.from("pillow_products").select("id,size,kind").eq("is_active", true),
          supabaseClient.from("product_prices").select("key,msrp"),
          supabaseClient.from("item_prices").select("item_id,msrp"),
          supabaseClient
            .from("bom_templates")
            .select("id,name,kind,key,pillow_kind,pillow_variant")
            .order("updated_at", { ascending: false }),
        ]);
      if (cancelled) return;
      setItems((itemsData ?? []) as Item[]);
      setProducts((productsData ?? []) as Product[]);
      const nextProduct: Record<string, number | string | null> = {};
      (productPrices ?? []).forEach((p: { key: string; msrp: number | string | null }) => {
        nextProduct[String(p.key)] = p.msrp ?? null;
      });
      const nextItem: Record<number, number | string | null> = {};
      (itemPrices ?? []).forEach((r: { item_id: number | string; msrp: number | string | null }) => {
        nextItem[Number(r.item_id)] = r.msrp ?? null;
      });
      setShopifyProductMsrpByKey(nextProduct);
      setShopifyItemMsrpById(nextItem);
      setBomTemplateRows(templates ?? []);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadShopifySalesQueue();
  }, [loadShopifySalesQueue]);

  const shopifyTemplatesByKey = useMemo(
    () => groupShopifyTemplatesByKey(bomTemplateRows),
    [bomTemplateRows],
  );

  const pillowProductIdByKindSize = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p) => {
      const kind = p.kind === "premium" ? "premium" : "basic";
      m[`${kind}:${p.size}`] = Number(p.id);
    });
    return m;
  }, [products]);

  const shopifyTemplateMetaById = useMemo(() => {
    const m = new Map<number, ShopifyTemplateOption>();
    Object.values(shopifyTemplatesByKey).forEach((list) => {
      list.forEach((t) => m.set(t.id, t));
    });
    return m;
  }, [shopifyTemplatesByKey]);

  const resolveQueueLinePriceLabel = useCallback(
    (
      row: ShopifyQueueRow,
      choice: ShopifyTemplateChoice | null | undefined,
      replaceLines: ShopifyReplaceLine[] = [],
    ) => {
      if (choice === "replace") {
        const unitMsrp = sumReplaceLinesMsrp(replaceLines, shopifyItemMsrpById);
        if (unitMsrp == null) return "—";
        return formatCurrency(unitMsrp * Number(row.quantity));
      }
      const templateId =
        choice !== null && choice !== undefined && choice !== "" ? Number(choice) : null;
      const tpl = templateId != null ? shopifyTemplateMetaById.get(templateId) : undefined;
      const templatePillowVariant =
        tpl?.pillow_variant === "linen" || tpl?.pillow_variant === "fibrecool"
          ? tpl.pillow_variant
          : null;
      const msrp = resolveShopifyQueueLineMsrp({
        kind: row.kind,
        pillowSize: row.pillow_size,
        pillowKind: row.pillow_kind,
        bolsterVariant: row.bolster_variant,
        itemId: row.item_id,
        variantTitle: row.variant_title,
        templatePillowVariant,
        pillowProductIdByKindSize,
        productMsrpByKey: shopifyProductMsrpByKey,
        itemMsrpById: shopifyItemMsrpById,
      });
      return msrp == null ? "—" : formatCurrency(msrp);
    },
    [pillowProductIdByKindSize, shopifyItemMsrpById, shopifyProductMsrpByKey, shopifyTemplateMetaById],
  );

  const buildShopifyQueueCommit = useCallback(
    (row: ShopifyQueueRow, choice: ShopifyTemplateChoice | undefined): ShopifyQueueCommit | { error: string } => {
      if (row.kind === "part") {
        return { queueId: row.id, templateId: null };
      }
      if (choice === undefined || choice === "") {
        return { error: "Select a template or Replace for every pillow/bolster line" };
      }
      if (choice === "replace") {
        const lines = (shopifyReplaceLines[row.id] ?? []).filter((line) => line.quantity > 0);
        if (!lines.length) {
          return { error: "Select parts for Replace before continuing" };
        }
        return { queueId: row.id, templateId: null, replaceLines: lines };
      }
      return { queueId: row.id, templateId: Number(choice) };
    },
    [shopifyReplaceLines],
  );

  const openShopifyReplaceDrawer = useCallback((rowId: number) => {
    setShopifyReplaceDrawerRowId(rowId);
    setShopifyReplaceDraftLines(shopifyReplaceLines[rowId] ?? []);
  }, [shopifyReplaceLines]);

  const confirmShopifyReplace = useCallback(() => {
    if (shopifyReplaceDrawerRowId == null) return;
    const lines = shopifyReplaceDraftLines.filter((line) => line.quantity > 0);
    setShopifyReplaceLines((prev) => ({ ...prev, [shopifyReplaceDrawerRowId]: lines }));
    setShopifyTemplateChoice((prev) => ({ ...prev, [shopifyReplaceDrawerRowId]: "replace" }));
    setShopifyReplaceDrawerRowId(null);
  }, [shopifyReplaceDraftLines, shopifyReplaceDrawerRowId]);

  const partGroups = useMemo(() => {
    const grouped = new Map<Item["category"], Item[]>();
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

  const commitQueuedShopifySales = async () => {
    const commits: ShopifyQueueCommit[] = [];
    for (const row of shopifyQueue) {
      const choice = shopifyTemplateChoice[row.id];
      const built = buildShopifyQueueCommit(row, choice);
      if ("error" in built) {
        toast.error(built.error);
        return;
      }
      commits.push(built);
    }

    if (!commits.length) {
      toast.message("No Shopify sales to commit");
      return;
    }

    setSavingShopifySales(true);
    try {
      await commitShopifySales({ commits });
      toast.success("Shopify sales committed");
      await loadShopifySalesQueue();
      notifyInventoryChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to commit Shopify sales");
    } finally {
      setSavingShopifySales(false);
    }
  };

  const stockOutQueueRow = async (row: ShopifyQueueRow) => {
    const built = buildShopifyQueueCommit(row, shopifyTemplateChoice[row.id]);
    if ("error" in built) {
      toast.error(built.error);
      return;
    }

    setSavingShopifySales(true);
    try {
      await commitShopifySales({ commits: [built] });
      toast.success("Stocked out");
      await loadShopifySalesQueue();
      if (shopifySalesTab === "archived") await loadShopifySalesQueueArchived();
      notifyInventoryChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stock out");
    } finally {
      setSavingShopifySales(false);
    }
  };

  const stockOutOrderGroup = async (lines: ShopifyQueueRow[]) => {
    const commits: ShopifyQueueCommit[] = [];
    for (const row of lines) {
      const built = buildShopifyQueueCommit(row, shopifyTemplateChoice[row.id]);
      if ("error" in built) {
        toast.error(built.error);
        return;
      }
      commits.push(built);
    }

    setSavingShopifySales(true);
    try {
      await commitShopifySales({ commits });
      toast.success("Stocked out");
      await loadShopifySalesQueue();
      if (shopifySalesTab === "archived") await loadShopifySalesQueueArchived();
      notifyInventoryChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stock out");
    } finally {
      setSavingShopifySales(false);
    }
  };

  const renderShopifySalesTable = (
    groups: ReturnType<typeof groupShopifyQueueByOrder<ShopifyQueueRow>>,
    mode: "active" | "archived",
  ) => {
    if (groups.length === 0) {
      return (
        <div className="rounded border p-3 text-sm text-muted-foreground">
          {mode === "active" ? "No pending Shopify sales." : "No archived Shopify sales."}
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
              <TableHead className="w-[120px]">Price</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="w-[90px]">Qty</TableHead>
              <TableHead className="w-[260px]">Template</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const orderDate = formatQueueDate(group.orderCreatedAt ?? "");
              const orderLabel =
                group.orderName?.trim() ||
                (group.orderId ? `#${group.orderId}` : "—");

              const renderLineRow = (row: ShopifyQueueRow) => {
                const key =
                  row.kind === "pillow"
                    ? `pillow:${row.pillow_kind ?? "basic"}:${row.pillow_size ?? ""}`
                    : row.kind === "bolster"
                      ? `bolster:${row.bolster_variant ?? ""}`
                      : null;
                const options = key ? (shopifyTemplatesByKey[key] ?? []) : [];
                const needsTemplate = row.kind === "pillow" || row.kind === "bolster";
                const archivedReplaceLines = parseReplaceLinesFromMetadata(row.metadata);
                const rowChoice: ShopifyTemplateChoice =
                  mode === "archived"
                    ? (archivedReplaceLines ? "replace" : (row.chosen_template_id ?? ""))
                    : shopifyTemplateChoice[row.id] === undefined
                      ? (archivedReplaceLines ? "replace" : (row.chosen_template_id ?? ""))
                      : shopifyTemplateChoice[row.id];
                const replaceLines =
                  mode === "archived"
                    ? (archivedReplaceLines ?? [])
                    : (shopifyReplaceLines[row.id] ?? []);
                const priceLabel = resolveQueueLinePriceLabel(row, rowChoice, replaceLines);
                const partItem =
                  row.kind === "part" && row.item_id ? (itemsById.get(row.item_id) ?? null) : null;
                const label =
                  row.kind === "pillow"
                    ? `${row.pillow_kind === "premium" ? "Premium" : "Basic"} Pillow ${row.pillow_size ?? ""}`
                    : row.kind === "bolster"
                      ? `Bolster ${row.bolster_variant ?? ""}`
                      : partItem
                        ? getInventoryItemDisplayLabel(partItem)
                        : `Part ${row.item_id ?? ""}`;

                return (
                  <TableRow key={row.id} className="border-t-0">
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-sm whitespace-nowrap tabular-nums">{priceLabel}</TableCell>
                    <TableCell className="text-sm">
                      {row.kind === "part" && partItem ? (
                        <>
                          <InventoryItemLabel item={partItem} />
                          <div className="text-xs text-muted-foreground">{row.variant_title ?? ""}</div>
                          {row.sku ? (
                            <div className="text-xs text-muted-foreground">{row.sku}</div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{label}</div>
                            {row.kind === "part" && row.item_id && !partItem ? (
                              <span className="inline-flex items-center rounded border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                Unmapped
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{row.variant_title ?? ""}</div>
                          {row.sku ? (
                            <div className="text-xs text-muted-foreground">{row.sku}</div>
                          ) : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{row.quantity}</TableCell>
                    <TableCell>
                      {needsTemplate ? (
                        mode === "archived" ? (
                          <div className="text-sm text-muted-foreground">
                            {rowChoice === "replace"
                              ? "Replace"
                              : rowChoice
                                ? (options.find((t) => t.id === Number(rowChoice))?.name ?? `Template #${rowChoice}`)
                                : "—"}
                          </div>
                        ) : (
                          <Select
                            value={
                              rowChoice === "replace"
                                ? SHOPIFY_REPLACE_SELECT_VALUE
                                : String(rowChoice ?? "")
                            }
                            onValueChange={(value) => {
                              if (value === SHOPIFY_REPLACE_SELECT_VALUE) {
                                setShopifyTemplateChoice((prev) => ({ ...prev, [row.id]: "replace" }));
                                openShopifyReplaceDrawer(row.id);
                                return;
                              }
                              setShopifyTemplateChoice((prev) => ({
                                ...prev,
                                [row.id]: value ? Number(value) : "",
                              }));
                              if (value) {
                                setShopifyReplaceLines((prev) => {
                                  const next = { ...prev };
                                  delete next[row.id];
                                  return next;
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select template…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Select template…</SelectItem>
                              {options.map((t) => (
                                <SelectItem key={t.id} value={String(t.id)}>
                                  {t.name}
                                </SelectItem>
                              ))}
                              <SelectItem value={SHOPIFY_REPLACE_SELECT_VALUE}>Replace</SelectItem>
                            </SelectContent>
                          </Select>
                        )
                      ) : (
                        <div className="text-sm text-muted-foreground">—</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {mode === "active" ? (
                        <Button size="sm" onClick={() => stockOutQueueRow(row)}>
                          Stock out
                        </Button>
                      ) : (
                        <div className="text-sm text-muted-foreground">—</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              };

              return (
                <Fragment key={group.orderId}>
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-sm whitespace-nowrap font-medium">{orderDate}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{orderLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {group.lines.length} item{group.lines.length === 1 ? "" : "s"}
                      </div>
                    </TableCell>
                    <TableCell />
                    <TableCell colSpan={3} />
                    <TableCell>
                      {mode === "active" ? (
                        <Button size="sm" variant="secondary" onClick={() => stockOutOrderGroup(group.lines)}>
                          Stock out all
                        </Button>
                      ) : (
                        <div className="text-sm text-muted-foreground">—</div>
                      )}
                    </TableCell>
                  </TableRow>
                  {group.lines.map(renderLineRow)}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <>
      <section className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium">Shopify Sales</div>
            <div className="text-xs text-muted-foreground">Review new paid orders and choose templates before committing inventory.</div>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              value={shopifySalesSearch}
              onChange={(e) => setShopifySalesSearch(e.target.value)}
              placeholder="Search order #…"
              className="w-full sm:w-[220px]"
              disabled={loadingShopifySales || savingShopifySales}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={loadingShopifySales || savingShopifySales}
                >
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
                  numberOfMonths={1}
                  className="rounded-lg border shadow-sm"
                />
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={loadingShopifySales || savingShopifySales}
                >
                  Limit: {shopifyRefreshLimit}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                sideOffset={6}
                className="p-3 w-[min(360px,calc(100vw-2rem))]"
              >
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
              className="w-full sm:w-auto"
              onClick={async () => {
                if (shopifySalesTab === "archived") {
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
                  const result = await refreshShopifySalesQueueFromShopify({
                    from: toStartOfDayIso(from),
                    to: toEndOfDayIso(to),
                    limit: shopifyRefreshLimit,
                  });
                  setShopifyActivePage(1);
                  await loadShopifySalesQueue();
                  toast.success(
                    result.enqueued
                      ? `Refreshed ${result.enqueued} sale line${result.enqueued === 1 ? "" : "s"}`
                      : "Refresh complete — no new mapped lines in range",
                  );
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to fetch Shopify orders");
                } finally {
                  setLoadingShopifySales(false);
                }
              }}
              disabled={loadingShopifySales || savingShopifySales}
            >
              {loadingShopifySales ? "Refreshing…" : "Refresh"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={commitQueuedShopifySales}
              disabled={savingShopifySales || shopifyQueue.length === 0 || shopifySalesTab !== "active"}
            >
              {savingShopifySales ? "Saving…" : "Save"}
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
            <TabsTrigger value="active">Active ({groupedShopifyQueue.length})</TabsTrigger>
            <TabsTrigger value="archived">Archived ({groupedShopifyQueueArchived.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            {renderShopifySalesTable(pagedShopifyOrderGroups, "active")}
            {renderPagination({ total: groupedShopifyQueue.length, page: shopifyActivePage, setPage: setShopifyActivePage })}
          </TabsContent>
          <TabsContent value="archived">
            {renderShopifySalesTable(pagedShopifyOrderGroupsArchived, "archived")}
            {renderPagination({
              total: groupedShopifyQueueArchived.length,
              page: shopifyArchivedPage,
              setPage: setShopifyArchivedPage,
            })}
          </TabsContent>
        </Tabs>
      </section>

      <ShopifyReplaceDrawer
        open={shopifyReplaceDrawerRowId != null}
        onOpenChange={(open) => {
          if (!open) setShopifyReplaceDrawerRowId(null);
        }}
        partGroups={partGroups}
        lines={shopifyReplaceDraftLines}
        setLines={setShopifyReplaceDraftLines}
        onConfirm={confirmShopifyReplace}
      />
    </>
  );
}

function ShopifyReplaceDrawer({
  open,
  onOpenChange,
  partGroups,
  lines,
  setLines,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partGroups: Array<{ key: string; title: string; items: Item[] }>;
  lines: ShopifyReplaceLine[];
  setLines: Dispatch<SetStateAction<ShopifyReplaceLine[]>>;
  onConfirm: () => void;
}) {
  const getQty = (itemId: number) => lines.find((line) => line.item_id === itemId)?.quantity ?? 0;

  const upsert = (item_id: number, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((line) => line.item_id !== item_id);
      const idx = prev.findIndex((line) => line.item_id === item_id);
      if (idx === -1) return [...prev, { item_id, quantity }];
      return prev.map((line) => (line.item_id === item_id ? { ...line, quantity } : line));
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Replace parts</SheetTitle>
          <SheetDescription>Select inventory parts and quantities for this sale line.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-6 px-4">
          {partGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">{group.title}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-[140px]">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <InventoryItemLabel item={item} />
                      </TableCell>
                      <TableCell className="w-[140px]">
                        <Input
                          type="number"
                          min={0}
                          value={getQty(item.id)}
                          onChange={(e) =>
                            upsert(item.id, Math.max(0, Number.parseInt(e.target.value || "0", 10)))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
        <SheetFooter>
          <div className="flex w-full gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={onConfirm}
              disabled={!lines.some((line) => line.quantity > 0)}
            >
              Confirm
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
