"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { InventoryItemLabel, getInventoryCategoryTitle, getInventoryItemDisplayLabel } from "../inventory/item-label";

type PriceRecord = { cost_price: string | number | null; msrp: string | number | null };

type PillowSize = "XS" | "S" | "M" | "L" | "XL";

type ItemRow = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  pricing?: PriceRecord | PriceRecord[] | null;
};

type DraftRow = { costPrice: string; msrp: string };
type DraftState = Record<string, DraftRow>;
type BaselineState = Record<string, { cost: number | null; msrp: number | null }>;

type BolsterVariant = "short" | "medium" | "long";

type ProductComponent = { itemId: number; quantity: number };

type ProductComponentDetail = {
  item: ItemRow;
  quantity: number;
  costEach: number | null;
  totalCost: number | null;
};

type ProductComponentGroup = {
  key: string;
  title: string;
  rows: ProductComponentDetail[];
};

type ProductRow = {
  key: string;
  kind: "pillow" | "bolster";
  label: string;
  size?: PillowSize;
  productId?: number;
  variant?: BolsterVariant;
  costCents: number | null;
  msrpCents: number | null;
  components: ProductComponent[];
};

type ProductSaveRow = {
  key: string;
  kind: "pillow" | "bolster";
  productId?: number;
  variant?: BolsterVariant;
  msrpCents: number | null;
};

const BOLSTER_VARIANTS: BolsterVariant[] = ["short", "medium", "long"];

const BOLSTER_VARIANT_TITLES: Record<BolsterVariant, string> = {
  short: "Short (0.8m)",
  medium: "Medium (1m)",
  long: "Long (1.2m)",
};

const BASIC_PILLOW_SIZES: PillowSize[] = ["XS", "S", "M", "L", "XL"];

const PILLOW_SIZE_ORDER = new Map<PillowSize, number>(
  BASIC_PILLOW_SIZES.map((size, index) => [size, index]),
);

const BOLSTER_VARIANT_ORDER = new Map<BolsterVariant, number>(
  BOLSTER_VARIANTS.map((variant, index) => [variant, index]),
);

type ProductGroupKey = "basic" | "premium" | "bolster";

type ProductGroupDefinition = {
  key: ProductGroupKey;
  title: string;
  description: string;
  filter: (product: ProductRow) => boolean;
  countLabel?: string;
  defaultOpen?: boolean;
  emptyState?: string;
};

const PREMIUM_PRODUCT_KEYS = new Set<string>([]);

const PRODUCT_GROUP_DEFINITIONS: ProductGroupDefinition[] = [
  {
    key: "basic",
    title: "Basic Mpillow",
    description: "Basic Mpillow sizes (XS–XL) share the same cost build.",
    filter: (product) => product.kind === "pillow" && !PREMIUM_PRODUCT_KEYS.has(product.key),
    countLabel: "sizes",
    defaultOpen: true,
  },
  {
    key: "premium",
    title: "Premium Mpillow",
    description: "Premium fabrics get their own pricing when configured.",
    filter: (product) => PREMIUM_PRODUCT_KEYS.has(product.key),
    countLabel: "sizes",
    emptyState: "No premium Mpillow variants have been configured yet.",
  },
  {
    key: "bolster",
    title: "Mbolster",
    description: "Bolster variants (short/medium/long) are listed here.",
    filter: (product) => product.kind === "bolster",
    countLabel: "variants",
    emptyState: "No bolster variants configured yet.",
  },
];

const getPillowSizeIndex = (value?: PillowSize): number =>
  value ? PILLOW_SIZE_ORDER.get(value) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

const getBolsterVariantIndex = (value?: BolsterVariant): number =>
  value ? BOLSTER_VARIANT_ORDER.get(value) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

const sortProductRows = (items: ProductRow[]): ProductRow[] =>
  [...items].sort((left, right) => {
    if (left.kind === "pillow" && right.kind === "pillow") {
      const leftIndex = getPillowSizeIndex(left.size);
      const rightIndex = getPillowSizeIndex(right.size);
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }
    if (left.kind === "bolster" && right.kind === "bolster") {
      const leftIndex = getBolsterVariantIndex(left.variant);
      const rightIndex = getBolsterVariantIndex(right.variant);
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }
    return left.label.localeCompare(right.label);
  });

const itemKey = (id: number) => `item:${id}`;
const pillowKey = (productId: number) => `product:pillow:${productId}`;
const bolsterKey = (variant: BolsterVariant) => `product:bolster:${variant}`;

const CATEGORY_ORDER = ["cover", "case", "protector", "filling", "packaging", "accessories", "other"];

const FILTER_TAG_COLLAPSED_ROW_LIMIT = 3;

const toCents = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(numeric)) return null;
  return Math.round(numeric * 100);
};

const formatFromCents = (cents: number | null): string => {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
};

const formatCentsLabel = (cents: number | null): string => {
  if (cents === null) return "—";
  return `$${formatFromCents(cents)}`;
};

const formatDraftCurrencyLabel = (value: string | undefined): string => {
  if (!value || value.trim() === "") return "—";
  return `$${value}`;
};

const sanitizeCurrencyInput = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return "";
  const [intPart = "", ...rest] = cleaned.split(".");
  const decimals = rest.join("");
  const normalizedInt = intPart.replace(/^0+(?=\d)/, "") || "0";
  if (raw.includes(".") && decimals === "") {
    return `${normalizedInt}.`;
  }
  if (decimals) {
    return `${normalizedInt}.${decimals.slice(0, 2)}`;
  }
  return normalizedInt;
};

const parseToCents = (value: string): number | null => {
  if (!value || value === ".") return null;
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  if (normalized === "") return null;
  const num = Number.parseFloat(normalized);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
};

const computeProductComponentsCostCents = (
  components: ProductComponent[],
  costMap: Map<number, number | null>,
): number | null => {
  if (components.length === 0) return 0;
  let total = 0;
  for (const component of components) {
    const cost = costMap.get(component.itemId);
    if (cost === undefined || cost === null) {
      continue; // skip components without cost so we still show partial totals
    }
    total += cost * component.quantity;
  }
  return Math.round(total);
};

export default function CostingsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [draft, setDraft] = useState<DraftState>({});
  const [baseline, setBaseline] = useState<BaselineState>({});
  const [partFilters, setPartFilters] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productSheetKey, setProductSheetKey] = useState<string | null>(null);
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [collapsedVisibleFilterCount, setCollapsedVisibleFilterCount] = useState<number | null>(null);
  const [filterMeasureVersion, setFilterMeasureVersion] = useState(0);
  const filterMeasureRef = useRef<HTMLDivElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [groupOpenStates, setGroupOpenStates] = useState<Record<ProductGroupKey, boolean>>(() =>
    Object.fromEntries(
      PRODUCT_GROUP_DEFINITIONS.map((group) => [group.key, Boolean(group.defaultOpen)]),
    ) as Record<ProductGroupKey, boolean>,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      type RawItemRow = ItemRow & { pricing?: PriceRecord | PriceRecord[] | null };
      type RawPillowRow = { id: number; size: string };
      type RawBomLine = { product_id: number; item_id: number; quantity: number | string };
      type RawBolsterLine = { variant: string; item_id: number; quantity: number | string };
      type RawProductPrice = {
        key: string;
        kind: "pillow" | "bolster";
        product_id: number | null;
        variant: string | null;
        msrp: string | number | null;
      };

      const [
        { data: itemsData, error: itemsError },
        { data: pillowData, error: pillowError },
        { data: bomData, error: bomError },
        { data: bolsterData, error: bolsterError },
        { data: productPricesData, error: productPricesError },
      ] = await Promise.all([
        supabaseClient
          .from("items")
          .select("id,category,name,size,subtype,pricing:item_prices!left(cost_price,msrp)")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true })
          .order("size", { ascending: true, nullsFirst: false })
          .order("subtype", { ascending: true, nullsFirst: false }),
        supabaseClient
          .from("pillow_products")
          .select("id,size")
          .eq("is_active", true)
          .order("size", { ascending: true }),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
        supabaseClient.from("bolster_bom_lines").select("variant,item_id,quantity"),
        supabaseClient.from("product_prices").select("key,kind,product_id,variant,msrp"),
      ]);

      if (itemsError) throw new Error(itemsError.message);
      if (pillowError) throw new Error(pillowError.message);
      if (bomError) throw new Error(bomError.message);
      if (bolsterError) throw new Error(bolsterError.message);
      if (productPricesError) throw new Error(productPricesError.message);

      const rows = (itemsData ?? []) as RawItemRow[];
      const nextItems = rows.map(({ id, category, name, size, subtype }) => ({
        id,
        category,
        name,
        size,
        subtype,
      }));
      const nextDraft: DraftState = {};
      const nextBaseline: BaselineState = {};
      const itemCostById = new Map<number, number | null>();

      rows.forEach((row) => {
        const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
        const costCents = toCents(pricing?.cost_price);
        const msrpCents = toCents(pricing?.msrp);
        const key = itemKey(row.id);
        nextDraft[key] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
        };
        nextBaseline[key] = { cost: costCents, msrp: msrpCents };
        itemCostById.set(row.id, costCents);
      });

      const bomLines = (bomData ?? []) as RawBomLine[];
      const bolsterLines = (bolsterData ?? []) as RawBolsterLine[];
      const pillowProducts = (pillowData ?? []) as RawPillowRow[];
      const productPrices = (productPricesData ?? []) as RawProductPrice[];

      const bomByProduct = new Map<number, ProductComponent[]>();
      bomLines.forEach((line) => {
        const productId = Number(line.product_id);
        const itemId = Number(line.item_id);
        const quantity = Number(line.quantity);
        if (!Number.isFinite(productId) || !Number.isFinite(itemId) || !Number.isFinite(quantity)) {
          return;
        }
        const list = bomByProduct.get(productId) ?? [];
        list.push({ itemId, quantity });
        bomByProduct.set(productId, list);
      });

      const bolsterByVariant: Record<BolsterVariant, ProductComponent[]> = {
        short: [],
        medium: [],
        long: [],
      };
      bolsterLines.forEach((line) => {
        const variant = line.variant;
        if (variant !== "short" && variant !== "medium" && variant !== "long") return;
        const itemId = Number(line.item_id);
        const quantity = Number(line.quantity);
        if (!Number.isFinite(itemId) || !Number.isFinite(quantity)) return;
        bolsterByVariant[variant].push({ itemId, quantity });
      });

      const priceByProductId = new Map<number, RawProductPrice>();
      const priceByVariant = new Map<BolsterVariant, RawProductPrice>();
      productPrices.forEach((row) => {
        if (row.kind === "pillow" && row.product_id !== null) {
          priceByProductId.set(row.product_id, row);
        } else if (row.kind === "bolster" && row.variant && (row.variant === "short" || row.variant === "medium" || row.variant === "long")) {
          const variant = row.variant as BolsterVariant;
          priceByVariant.set(variant, row);
        }
      });

      const costForComponents = (components: ProductComponent[]): number | null => {
        if (components.length === 0) return 0;
        let total = 0;
        for (const component of components) {
          const cost = itemCostById.get(component.itemId);
          if (cost === undefined || cost === null) {
            return null;
          }
          total += cost * component.quantity;
        }
        return Math.round(total);
      };

      const productDraft: DraftState = {};
      const productBaseline: BaselineState = {};
      const productRows: ProductRow[] = [];

      const pillowOrder = new Map(
        ["XS", "S", "M", "L", "XL"].map((size, index) => [size, index]),
      );

      pillowProducts
        .slice()
        .sort((a, b) => {
          const left = pillowOrder.get(a.size) ?? Number.MAX_SAFE_INTEGER;
          const right = pillowOrder.get(b.size) ?? Number.MAX_SAFE_INTEGER;
          if (left !== right) return left - right;
          return a.size.localeCompare(b.size);
        })
        .forEach((product) => {
          const key = pillowKey(product.id);
          const components = bomByProduct.get(product.id) ?? [];
          const costCents = costForComponents(components);
          const price = priceByProductId.get(product.id);
          const msrpCents = toCents(price?.msrp ?? null);
          productDraft[key] = {
            costPrice: formatFromCents(costCents),
            msrp: formatFromCents(msrpCents),
          };
          productBaseline[key] = { cost: costCents, msrp: msrpCents };
          productRows.push({
            key,
            kind: "pillow",
            label: `Pillow — ${product.size}`,
            size: product.size as PillowSize,
            productId: product.id,
            costCents,
            msrpCents,
            components,
          });
        });

      BOLSTER_VARIANTS.forEach((variant) => {
        const key = bolsterKey(variant);
        const components = bolsterByVariant[variant];
        const costCents = costForComponents(components);
        const price = priceByVariant.get(variant);
        const msrpCents = toCents(price?.msrp ?? null);
        productDraft[key] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
        };
        productBaseline[key] = { cost: costCents, msrp: msrpCents };
        productRows.push({
          key,
          kind: "bolster",
          label: `Bolster — ${BOLSTER_VARIANT_TITLES[variant]}`,
          variant,
          costCents,
          msrpCents,
          components,
        });
      });

      setItems(nextItems);
      setProducts(productRows);
      setDraft({ ...nextDraft, ...productDraft });
      setBaseline({ ...nextBaseline, ...productBaseline });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load costings";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabaseClient
      .channel("costings-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pillow_products" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bom_lines" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bolster_bom_lines" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_prices" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    const handleInventoryChange = () => {
      load();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("inventory:changed", handleInventoryChange);
      let broadcast: BroadcastChannel | null = null;
      try {
        if ("BroadcastChannel" in window) {
          broadcast = new BroadcastChannel("inventory:changed");
          broadcast.onmessage = handleInventoryChange;
        }
      } catch {
        broadcast = null;
      }
      return () => {
        window.removeEventListener("inventory:changed", handleInventoryChange);
        if (broadcast) {
          broadcast.close();
        }
      };
    }
    return undefined;
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const aIndex = CATEGORY_ORDER.indexOf(a[0]);
        const bIndex = CATEGORY_ORDER.indexOf(b[0]);
        if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
      .map(([category, list]) => ({
        category,
        title: getInventoryCategoryTitle(category),
        items: list.sort((left, right) =>
          getInventoryItemDisplayLabel(left).localeCompare(getInventoryItemDisplayLabel(right)),
        ),
      }));
  }, [items]);

  const itemMap = useMemo(() => {
    const map = new Map<number, ItemRow>();
    items.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [items]);

  useEffect(() => {
    setPartFilters((prev) => prev.filter((id) => itemMap.has(id)));
  }, [itemMap]);

  const hasActiveFilters = partFilters.length > 0;

  const availableFilterItems = useMemo(() => {
    const selected = new Set(partFilters);
    return items
      .filter((item) => !selected.has(item.id))
      .sort((left, right) => getInventoryItemDisplayLabel(left).localeCompare(getInventoryItemDisplayLabel(right)));
  }, [items, partFilters]);

  const activeFilterItems = useMemo(
    () =>
      partFilters
        .map((id) => itemMap.get(id))
        .filter((item): item is ItemRow => Boolean(item)),
    [itemMap, partFilters],
  );

  const visibleFilterItems = useMemo(() => {
    if (filtersExpanded) return activeFilterItems;
    if (collapsedVisibleFilterCount === null) return activeFilterItems;
    return activeFilterItems.slice(0, collapsedVisibleFilterCount);
  }, [activeFilterItems, collapsedVisibleFilterCount, filtersExpanded]);

  const hiddenFilterCount = useMemo(() => {
    if (filtersExpanded) return 0;
    if (collapsedVisibleFilterCount === null) return 0;
    return Math.max(0, activeFilterItems.length - collapsedVisibleFilterCount);
  }, [activeFilterItems.length, collapsedVisibleFilterCount, filtersExpanded]);

  useLayoutEffect(() => {
    if (filtersExpanded) return;
    setCollapsedVisibleFilterCount(null);
  }, [activeFilterItems, filtersExpanded]);

  useLayoutEffect(() => {
    if (filtersExpanded) return;
    const container = filterMeasureRef.current;
    if (!container) return;

    const measure = () => {
      const children = Array.from(container.children) as HTMLElement[];
      if (children.length === 0) {
        setCollapsedVisibleFilterCount(0);
        return;
      }

      const rowOffsets = new Set<number>();
      let visibleCount = children.length;

      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        const offsetTop = Math.round(child.offsetTop);

        if (!rowOffsets.has(offsetTop)) {
          rowOffsets.add(offsetTop);
        }

        if (rowOffsets.size > FILTER_TAG_COLLAPSED_ROW_LIMIT) {
          visibleCount = index;
          break;
        }
      }

      setCollapsedVisibleFilterCount(visibleCount);
    };

    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [activeFilterItems, filtersExpanded, filterMeasureVersion]);

  useEffect(() => {
    const container = filterContainerRef.current;
    if (!hasActiveFilters || !container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setFilterMeasureVersion((prev) => prev + 1);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [hasActiveFilters]);

  const filteredGroups = useMemo(() => {
    if (partFilters.length === 0) return grouped;
    const selected = new Set(partFilters);
    return grouped
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => selected.has(item.id)),
      }))
      .filter((group) => group.items.length > 0);
  }, [grouped, partFilters]);

  const itemCostByIdFromDraft = useMemo(() => {
    const map = new Map<number, number | null>();
    items.forEach((item) => {
      const key = itemKey(item.id);
      const entry = draft[key];
      const cents = parseToCents(entry?.costPrice ?? "");
      map.set(item.id, cents);
    });
    return map;
  }, [items, draft]);

  const productCostDisplay = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      const totalCents = computeProductComponentsCostCents(product.components, itemCostByIdFromDraft);
      map.set(product.key, totalCents === null ? "" : formatFromCents(totalCents));
    });
    return map;
  }, [products, itemCostByIdFromDraft]);

  const groupedProducts = useMemo(() => {
    const assigned = new Set<string>();
    return PRODUCT_GROUP_DEFINITIONS.map((group) => {
      const groupProducts = products.filter((product) => {
        if (assigned.has(product.key)) return false;
        if (!group.filter(product)) return false;
        assigned.add(product.key);
        return true;
      });
      return { ...group, products: sortProductRows(groupProducts) };
    });
  }, [products]);

  const handleGroupOpenChange = useCallback((groupKey: ProductGroupKey, open: boolean) => {
    setGroupOpenStates((prev) => ({ ...prev, [groupKey]: open }));
  }, []);

  const renderProductCard = (product: ProductRow) => {
    const current = draft[product.key] ?? { costPrice: "", msrp: "" };
    const costDisplay = productCostDisplay.get(product.key) ?? current.costPrice;
    const partsCount = product.components.filter((component) => component.quantity > 0).length;
    const primaryLabel =
      product.kind === "pillow"
        ? product.label.replace(/^Pillow —\s*/, "")
        : product.variant
        ? BOLSTER_VARIANT_TITLES[product.variant]
        : product.label;
    const secondaryLabel = product.kind === "pillow" ? "Pillow Size" : "Bolster Variant";
    return (
      <div
        key={product.key}
        role="button"
        tabIndex={0}
        className="space-y-3 rounded-lg border p-4 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer select-none"
        onClick={() => openProductSheet(product.key)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openProductSheet(product.key);
          }
        }}
      >
        <div>
          <div className="text-xs text-muted-foreground">{secondaryLabel}</div>
          <div className="text-2xl font-semibold">{primaryLabel}</div>
        </div>
        <div className="text-xs text-muted-foreground">{partsCount} parts configured</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="font-medium">{formatDraftCurrencyLabel(costDisplay)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MSRP</div>
            <div className="font-medium">{formatDraftCurrencyLabel(current.msrp)}</div>
          </div>
        </div>
        <div>
          <Button size="sm" variant="secondary">
            View details
          </Button>
        </div>
      </div>
    );
  };

  const activeProduct = useMemo(() => {
    if (!productSheetKey) return null;
    return products.find((product) => product.key === productSheetKey) ?? null;
  }, [productSheetKey, products]);

  const activeProductDraft = useMemo(() => {
    if (!activeProduct) return null;
    return draft[activeProduct.key] ?? { costPrice: "", msrp: "" };
  }, [activeProduct, draft]);

  const activeProductCostDisplay = useMemo(() => {
    if (!activeProduct) return "";
    const fromComponents = computeProductComponentsCostCents(activeProduct.components, itemCostByIdFromDraft);
    if (fromComponents !== null) {
      return formatFromCents(fromComponents);
    }
    const display = productCostDisplay.get(activeProduct.key);
    if (display && display !== "") {
      return display;
    }
    return formatFromCents(activeProduct.costCents ?? null);
  }, [activeProduct, productCostDisplay, itemCostByIdFromDraft]);

  const activeProductComponents = useMemo(() => {
    if (!activeProduct) return [];
    const groups = new Map<string, ProductComponentGroup>();
    activeProduct.components.forEach((component) => {
      if (!component || component.quantity <= 0) return;
      const item = itemMap.get(component.itemId);
      if (!item) return;
      const category = item.category;
      const group = groups.get(category) ?? {
        key: category,
        title: getInventoryCategoryTitle(category),
        rows: [],
      };
      const costEach = itemCostByIdFromDraft.get(item.id) ?? null;
      const totalCost = costEach !== null ? costEach * component.quantity : null;
      group.rows.push({
        item,
        quantity: component.quantity,
        costEach,
        totalCost,
      });
      groups.set(category, group);
    });
    const sortIndex = (category: string) => {
      const index = CATEGORY_ORDER.indexOf(category);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return Array.from(groups.values())
      .sort((left, right) => {
        const leftIndex = sortIndex(left.key);
        const rightIndex = sortIndex(right.key);
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return left.title.localeCompare(right.title);
      })
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) =>
          getInventoryItemDisplayLabel(a.item).localeCompare(getInventoryItemDisplayLabel(b.item)),
        ),
      }));
  }, [activeProduct, itemCostByIdFromDraft, itemMap]);

  const openProductSheet = useCallback((productKey: string) => {
    setProductSheetKey(productKey);
    setProductSheetOpen(true);
  }, []);

  const closeProductSheet = useCallback(() => {
    setProductSheetOpen(false);
    setProductSheetKey(null);
  }, []);

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeProductSheet();
      } else if (productSheetKey) {
        setProductSheetOpen(true);
      }
    },
    [closeProductSheet, productSheetKey],
  );

  const handleInputChange = (rowKey: string, field: keyof DraftRow, raw: string) => {
    const sanitized = sanitizeCurrencyInput(raw);
    setDraft((prev) => {
      const current = prev[rowKey] ?? { costPrice: "", msrp: "" };
      return {
        ...prev,
        [rowKey]: { ...current, [field]: sanitized },
      };
    });
  };

  const handleBlur = (rowKey: string, field: keyof DraftRow) => {
    setDraft((prev) => {
      const current = prev[rowKey] ?? { costPrice: "", msrp: "" };
      const cents = parseToCents(current[field]);
      if (cents === null) {
        return {
          ...prev,
          [rowKey]: { ...current, [field]: "" },
        };
      }
      return {
        ...prev,
        [rowKey]: { ...current, [field]: (cents / 100).toFixed(2) },
      };
    });
  };

  const handleAddFilter = useCallback((value: string) => {
    const id = Number(value);
    if (!Number.isFinite(id)) return;
    setPartFilters((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleRemoveFilter = useCallback((id: number) => {
    setPartFilters((prev) => prev.filter((entry) => entry !== id));
  }, []);

  const clearFilters = useCallback(() => {
    setPartFilters([]);
  }, []);

  const isDirty = useMemo(() => {
    const itemChanged = items.some((item) => {
      const key = itemKey(item.id);
      const current = draft[key] ?? { costPrice: "", msrp: "" };
      const baselineRow = baseline[key] ?? { cost: null, msrp: null };
      const costCents = parseToCents(current.costPrice);
      const msrpCents = parseToCents(current.msrp);
      return costCents !== baselineRow.cost || msrpCents !== baselineRow.msrp;
    });
    if (itemChanged) return true;
    return products.some((product) => {
      const key = product.key;
      const current = draft[key] ?? { costPrice: "", msrp: "" };
      const baselineRow = baseline[key] ?? { cost: product.costCents ?? null, msrp: product.msrpCents ?? null };
      const msrpCents = parseToCents(current.msrp);
      return msrpCents !== baselineRow.msrp;
    });
  }, [items, products, draft, baseline]);

  const save = async () => {
    const rows = items
      .map((item) => {
        const key = itemKey(item.id);
        const current = draft[key] ?? { costPrice: "", msrp: "" };
        const baselineRow = baseline[key] ?? { cost: null, msrp: null };
        const costCents = parseToCents(current.costPrice);
        const msrpCents = parseToCents(current.msrp);
        if (costCents === baselineRow.cost && msrpCents === baselineRow.msrp) {
          return null;
        }
        return {
          itemId: item.id,
          costPriceCents: costCents,
          msrpCents: msrpCents,
        };
      })
      .filter((row): row is { itemId: number; costPriceCents: number | null; msrpCents: number | null } => row !== null);

    const productPayload = products
      .map((product) => {
        const key = product.key;
        const current = draft[key] ?? { costPrice: "", msrp: "" };
        const baselineRow = baseline[key] ?? { cost: product.costCents ?? null, msrp: product.msrpCents ?? null };
        const msrpCents = parseToCents(current.msrp);
        if (msrpCents === baselineRow.msrp) {
          return null;
        }
        const payload: ProductSaveRow = {
          key,
          kind: product.kind,
          msrpCents,
        };
        if (product.kind === "pillow") {
          if (product.productId === undefined) {
            return null;
          }
          payload.productId = product.productId;
        }
        if (product.kind === "bolster") {
          if (!product.variant) {
            return null;
          }
          payload.variant = product.variant;
        }
        return payload;
      })
      .filter((row): row is ProductSaveRow => row !== null);

    if (rows.length === 0 && productPayload.length === 0) {
      toast.message("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/settings/costings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, products: productPayload }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.error ?? "Failed to save costings";
        throw new Error(message);
      }
      if (payload?.products && Array.isArray(payload.products)) {
        const byKey = new Map<string, { costCents: number | null; msrpCents: number | null }>();
        payload.products.forEach((product: { key?: unknown; costCents?: unknown; msrpCents?: unknown }) => {
          if (typeof product?.key === "string") {
            const costCents = typeof product.costCents === "number" ? product.costCents : null;
            const msrpCents = typeof product.msrpCents === "number" ? product.msrpCents : null;
            byKey.set(product.key, { costCents, msrpCents });
          }
        });
        if (byKey.size > 0) {
          setProducts((prev) =>
            prev.map((product) => {
              const summary = byKey.get(product.key);
              if (!summary) return product;
              return {
                ...product,
                costCents: summary.costCents,
                msrpCents: summary.msrpCents,
              };
            }),
          );
        }
      }
      toast.success("Costings saved");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save costings";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading costings…</div>;
  }

  if (items.length === 0 && products.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <div className="text-2xl font-semibold">Costings</div>
        <p className="text-sm text-muted-foreground">No parts are currently active. Add items to begin tracking pricing.</p>
        <Button variant="secondary" onClick={load} disabled={saving}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Costings</h1>
          <p className="text-sm text-muted-foreground">
            Track cost price and MSRP for each part to keep your pricing consistent.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={saving}>
            Refresh
          </Button>
          <Button onClick={save} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-10">
        {products.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Products</h2>
              <p className="text-sm text-muted-foreground">
                Cost price is calculated from configured components. Enter MSRP to set retail pricing.
              </p>
            </div>
            <div className="space-y-4">
              {groupedProducts.map((group) => (
                <ProductGroupSection
                  key={group.key}
                  group={group}
                  products={group.products}
                  isOpen={Boolean(groupOpenStates[group.key])}
                  onOpenChange={(open) => handleGroupOpenChange(group.key, open)}
                  renderProductCard={renderProductCard}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Parts</h2>
            <p className="text-sm text-muted-foreground">
              Enter values as dollars. Leave blank to clear existing pricing for a part.
            </p>
          </div>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select closeOnSelect={false} onValueChange={handleAddFilter}>
                    <SelectTrigger className="w-[280px]" aria-label="Filter parts" disabled={availableFilterItems.length === 0}>
                      <SelectValue
                        placeholder={
                          availableFilterItems.length === 0
                            ? "All parts are already filtered"
                            : "Select parts to filter"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent align="start" className="w-[280px]">
                      <ScrollArea className="h-60">
                        <div className="p-1">
                          {availableFilterItems.map((item) => (
                            <SelectItem
                              key={item.id}
                              value={String(item.id)}
                              textValue={getInventoryItemDisplayLabel(item)}
                            >
                              {getInventoryItemDisplayLabel(item)}
                            </SelectItem>
                          ))}
                        </div>
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasActiveFilters}>
                    Clear filters
                  </Button>
                </div>
                {hasActiveFilters && (
                  <div className="text-xs text-muted-foreground">
                    Filtering {activeFilterItems.length} part{activeFilterItems.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              {hasActiveFilters && (
                <div className="space-y-2">
                  <div ref={filterContainerRef} className="relative">
                    {!filtersExpanded && (
                      <div
                        aria-hidden
                        className="absolute left-0 top-0 w-full pointer-events-none"
                        style={{ visibility: "hidden" }}
                      >
                        <div className="w-full rounded-md border bg-muted/30 p-2">
                          <div ref={filterMeasureRef} className="flex flex-wrap gap-2 min-w-0">
                            {activeFilterItems.map((item) => (
                              <Button key={`measure-${item.id}`} variant="secondary" size="sm" className="gap-2 max-w-full">
                                <span className="truncate">{getInventoryItemDisplayLabel(item)}</span>
                                <X className="size-4 shrink-0" />
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="w-full rounded-md border bg-muted/30 p-2">
                      <div className="flex flex-wrap gap-2 min-w-0">
                        {visibleFilterItems.map((item) => (
                          <Button
                            key={item.id}
                            variant="secondary"
                            size="sm"
                            className="gap-2 max-w-full"
                            onClick={() => handleRemoveFilter(item.id)}
                          >
                            <span className="truncate">{getInventoryItemDisplayLabel(item)}</span>
                            <X className="size-4 shrink-0" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {(hiddenFilterCount > 0 || filtersExpanded) && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiltersExpanded((prev) => !prev)}
                        aria-expanded={filtersExpanded}
                        className="gap-2"
                      >
                        {filtersExpanded ? (
                          <>
                            Show less
                            <ChevronUp className="size-4 shrink-0" />
                          </>
                        ) : (
                          <>
                            Show {hiddenFilterCount} more
                            <ChevronDown className="size-4 shrink-0" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {filteredGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parts match the current filters.</p>
            ) : (
              filteredGroups.map((group) => (
                <Section key={group.category} title={group.title}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-2/5">Part</TableHead>
                        <TableHead className="w-1/5">Cost Price</TableHead>
                        <TableHead className="w-1/5">MSRP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => {
                        const rowKey = itemKey(item.id);
                        const current = draft[rowKey] ?? { costPrice: "", msrp: "" };
                        const itemLabel = getInventoryItemDisplayLabel(item);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="align-middle">
                              <InventoryItemLabel item={item} />
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={current.costPrice}
                                  placeholder="0.00"
                                  onChange={(event) => handleInputChange(rowKey, "costPrice", event.target.value)}
                                  onBlur={() => handleBlur(rowKey, "costPrice")}
                                  className="pl-6"
                                  aria-label={`Cost price for ${itemLabel}`}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={current.msrp}
                                  placeholder="0.00"
                                  onChange={(event) => handleInputChange(rowKey, "msrp", event.target.value)}
                                  onBlur={() => handleBlur(rowKey, "msrp")}
                                  className="pl-6"
                                  aria-label={`MSRP for ${itemLabel}`}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Section>
              ))
            )}
          </div>
        </section>
      </div>

      <Sheet open={productSheetOpen && Boolean(activeProduct)} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{activeProduct?.label ?? "Product details"}</SheetTitle>
            <SheetDescription>Review configured parts and adjust pricing.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-6 px-2">
            {activeProduct ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Cost price</div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={activeProductCostDisplay}
                        placeholder="0.00"
                        disabled
                        className="pl-6"
                        aria-label={`Cost price for ${activeProduct.label}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">MSRP</div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={activeProductDraft?.msrp ?? ""}
                        placeholder="0.00"
                        onChange={(event) => handleInputChange(activeProduct.key, "msrp", event.target.value)}
                        onBlur={() => handleBlur(activeProduct.key, "msrp")}
                        className="pl-6"
                        aria-label={`MSRP for ${activeProduct.label}`}
                      />
                    </div>
                  </div>
                </div>
                <Separator />
                {activeProductComponents.length > 0 ? (
                  <div className="space-y-4">
                    {activeProductComponents.map((group) => (
                      <Section key={group.key} title={group.title}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-2/5">Part</TableHead>
                              <TableHead className="w-[70px]">Qty</TableHead>
                              <TableHead className="w-1/5">Cost Each</TableHead>
                              <TableHead className="w-1/5">Total Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.rows.map((detail) => (
                              <TableRow key={detail.item.id}>
                                <TableCell className="align-middle">
                                  <InventoryItemLabel item={detail.item} />
                                </TableCell>
                                <TableCell>{detail.quantity}</TableCell>
                                <TableCell>{formatCentsLabel(detail.costEach)}</TableCell>
                                <TableCell>{formatCentsLabel(detail.totalCost)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Section>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No parts configured for this product.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a product to view details.</p>
            )}
          </div>
          <SheetFooter>
            <Button variant="secondary" onClick={closeProductSheet}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type ProductGroupSectionProps = {
  group: ProductGroupDefinition;
  products: ProductRow[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  renderProductCard: (product: ProductRow) => ReactNode;
};

function ProductGroupSection({
  group,
  products,
  isOpen,
  onOpenChange,
  renderProductCard,
}: ProductGroupSectionProps) {
  const summaryLabel = `${products.length} ${group.countLabel ?? "variants"} configured`;
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <div className="overflow-hidden rounded-2xl border bg-background">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
            aria-expanded={isOpen}
          >
            <div>
              <div className="text-sm font-medium">{group.title}</div>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{summaryLabel}</span>
              <ChevronDown
                className={`size-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-4 pb-4 pt-2">
          {products.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">
              {group.emptyState ?? `No ${group.title} products configured yet.`}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => renderProductCard(product))}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
