"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { Button } from "@/components/ui/button";
import {
  PageActions,
  pageActionClassName,
  pageActionDockedClassName,
} from "@/components/ui/page-actions";
import { useMobileDockActions } from "@/components/ui/page-dock-actions";
import { cn } from "@/lib/utils";
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
import { ChevronDown, ChevronUp, CloudUpload, RotateCw, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { InventoryItemLabel, getInventoryCategoryTitle, getInventoryItemDisplayLabel } from "../inventory/item-label";
import { syncShopifyPricesOnly } from "../inventory/actions";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MobileStickyActionBar,
  mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";
import {
  stickyFirstColumnCellClassName as STICKY_PART_CELL,
  stickyFirstColumnHeadClassName as STICKY_PART_HEAD,
} from "@/components/ui/table-sticky";
import {
  computeOnHandValueKpis,
  type OnHandValueKpis,
} from "@/lib/costings/on-hand-value-kpis";

type PriceRecord = { cost_price: string | number | null; msrp: string | number | null; compare_at_price?: string | number | null };

type PillowSize = "XS" | "S" | "M" | "L" | "XL";
type PillowKind = "basic" | "premium";
type PremiumVariant = "linen" | "fibrecool";

type ItemRow = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  pricing?: PriceRecord | PriceRecord[] | null;
};

type DraftRow = { costPrice: string; msrp: string; compareAt: string };
type DraftState = Record<string, DraftRow>;
type BaselineState = Record<string, { cost: number | null; msrp: number | null; compareAt: number | null }>;

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
  pillowKind?: PillowKind;
  variant?: BolsterVariant;
  /** Case fabric family this price row is for — premium pillows only. */
  premiumVariant?: PremiumVariant;
  costCents: number | null;
  msrpCents: number | null;
  components: ProductComponent[];
  // Premium pillows can vary by fabric variant (e.g. Linen vs Fibrecool).
  // When available, we use the latest BOM template lines for that (size,variant)
  // so parts + cost reflect the selected premium variant.
  premiumComponentsByVariant?: Partial<Record<PremiumVariant, ProductComponent[]>>;
};

type ProductSaveRow = {
  key: string;
  kind: "pillow" | "bolster";
  productId?: number;
  /** Bolster length, or a premium pillow's case fabric family. */
  variant?: BolsterVariant | PremiumVariant;
  msrpCents: number | null;
  compareAtCents?: number | null;
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

const PRODUCT_GROUP_DEFINITIONS: ProductGroupDefinition[] = [
  {
    key: "basic",
    title: "Basic Mpillow",
    description: "Basic Mpillow sizes (XS–XL) share the same cost build.",
    filter: (product) => product.kind === "pillow" && product.pillowKind === "basic",
    countLabel: "sizes",
    defaultOpen: true,
  },
  {
    key: "premium",
    title: "Premium Mpillow",
    description: "Premium fabrics get their own pricing when configured.",
    filter: (product) => product.kind === "pillow" && product.pillowKind === "premium",
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

const REALTIME_RELOAD_DEBOUNCE_MS = 400;
const DRAFT_COMMIT_DEBOUNCE_MS = 250;

const itemKey = (id: number) => `item:${id}`;
const pillowKey = (productId: number) => `product:pillow:${productId}`;
const premiumPillowKey = (productId: number, variant: PremiumVariant) => `product:pillow:${productId}:${variant}`;
const bolsterKey = (variant: BolsterVariant) => `product:bolster:${variant}`;

const PREMIUM_VARIANTS: PremiumVariant[] = ["linen", "fibrecool"];
const PREMIUM_VARIANT_TITLES: Record<PremiumVariant, string> = {
  linen: "Linen",
  fibrecool: "Fibrecool",
};

const CATEGORY_ORDER = ["cover", "case", "protector", "filling", "packaging", "accessories", "other"];

const FILTER_TAG_COLLAPSED_ROW_LIMIT = 3;

/** Money columns: wide enough for "$ 123.45" on a phone, fluid on desktop. */
const MONEY_HEAD = "min-w-[7.5rem] whitespace-nowrap sm:w-1/5 sm:min-w-0";
const MONEY_CELL = "min-w-[7.5rem] sm:min-w-0";

const toCents = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(numeric)) return null;
  return Math.round(numeric * 100);
};

/** Same parse as Analytics on-hand strip (dollar floats from item_prices). */
const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const currencyFormatter = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 0,
});

const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
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

const EMPTY_DRAFT_ROW: DraftRow = { costPrice: "", msrp: "", compareAt: "" };

type PartRowProps = {
  item: ItemRow;
  costPrice: string;
  msrp: string;
  compareAt: string;
  onChange: (rowKey: string, field: keyof DraftRow, raw: string) => void;
  onBlur: (rowKey: string, field: keyof DraftRow) => void;
};

/**
 * One row of the parts table. Memoised on primitive props with stable
 * callbacks, so typing in one row leaves every other row untouched.
 */
const PartRow = memo(function PartRow({ item, costPrice, msrp, compareAt, onChange, onBlur }: PartRowProps) {
  const rowKey = itemKey(item.id);
  const itemLabel = getInventoryItemDisplayLabel(item);
  return (
    <TableRow>
      <TableCell className={STICKY_PART_CELL}>
        <InventoryItemLabel item={item} />
      </TableCell>
      <TableCell className={MONEY_CELL}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="text"
            inputMode="decimal"
            value={costPrice}
            placeholder="0.00"
            onChange={(event) => onChange(rowKey, "costPrice", event.target.value)}
            onBlur={() => onBlur(rowKey, "costPrice")}
            className="pl-6"
            aria-label={`Cost price for ${itemLabel}`}
          />
        </div>
      </TableCell>
      <TableCell className={MONEY_CELL}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="text"
            inputMode="decimal"
            value={msrp}
            placeholder="0.00"
            onChange={(event) => onChange(rowKey, "msrp", event.target.value)}
            onBlur={() => onBlur(rowKey, "msrp")}
            className="pl-6"
            aria-label={`MSRP for ${itemLabel}`}
          />
        </div>
      </TableCell>
      <TableCell className={MONEY_CELL}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="text"
            inputMode="decimal"
            value={compareAt}
            placeholder="(optional)"
            onChange={(event) => onChange(rowKey, "compareAt", event.target.value)}
            onBlur={() => onBlur(rowKey, "compareAt")}
            className="pl-6"
            aria-label={`Compare-at price for ${itemLabel}`}
          />
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function CostingsPage() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const settingsPath = useCallback((path: string) => withLocale(path, locale), [locale]);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [draft, setDraft] = useState<DraftState>({});
  // `draft` drives the inputs so typing is instant; `committedDraft` trails it by
  // a short debounce and is what the expensive derived memos key off, so a
  // keystroke no longer recomputes every product cost.
  const [committedDraft, setCommittedDraft] = useState<DraftState>({});
  const [baseline, setBaseline] = useState<BaselineState>({});
  const [partFilters, setPartFilters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productSheetKey, setProductSheetKey] = useState<string | null>(null);
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [collapsedVisibleFilterCount, setCollapsedVisibleFilterCount] = useState<number | null>(null);
  const [filterMeasureVersion, setFilterMeasureVersion] = useState(0);
  const filterMeasureRef = useRef<HTMLDivElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [premiumVariantSelection, setPremiumVariantSelection] = useState<PremiumVariant>("linen");
  const [syncingShopifyPrices, setSyncingShopifyPrices] = useState(false);
  const [onHandKpis, setOnHandKpis] = useState<OnHandValueKpis | null>(null);
  const [groupOpenStates, setGroupOpenStates] = useState<Record<ProductGroupKey, boolean>>(() =>
    Object.fromEntries(
      PRODUCT_GROUP_DEFINITIONS.map((group) => [group.key, Boolean(group.defaultOpen)]),
    ) as Record<ProductGroupKey, boolean>,
  );

  // Live mirrors so callbacks can read the newest values synchronously without
  // being re-created (and re-rendering memoised rows) on every keystroke.
  const draftRef = useRef<DraftState>({});
  const baselineRef = useRef<BaselineState>({});
  // True as soon as a keystroke makes a field differ from its baseline, so the
  // Save button enables immediately instead of waiting for the debounce.
  const [hasPendingEdit, setHasPendingEdit] = useState(false);

  const applyDraft = useCallback((updater: (prev: DraftState) => DraftState) => {
    const next = updater(draftRef.current);
    draftRef.current = next;
    setDraft(next);
  }, []);

  const applyBaseline = useCallback((next: BaselineState) => {
    baselineRef.current = next;
    setBaseline(next);
  }, []);

  const commitDraft = useCallback(() => {
    setCommittedDraft(draftRef.current);
    setHasPendingEdit(false);
  }, []);

  const commitDraftDebounced = useDebouncedCallback(commitDraft, DRAFT_COMMIT_DEBOUNCE_MS);

  /** Land any pending keystrokes into `committedDraft` right now. */
  const flushDraft = useCallback(() => {
    commitDraftDebounced.cancel();
    commitDraft();
  }, [commitDraft, commitDraftDebounced]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      type RawItemRow = ItemRow & { pricing?: PriceRecord | PriceRecord[] | null };
      type RawPillowRow = { id: number; size: string; kind: PillowKind | string | null };
      type RawBomLine = { product_id: number; item_id: number; quantity: number | string };
      type RawBolsterLine = { variant: string; item_id: number; quantity: number | string };
      type RawProductPrice = {
        key: string;
        kind: "pillow" | "bolster";
        product_id: number | null;
        variant: string | null;
        msrp: string | number | null;
        compare_at_price?: string | number | null;
      };
      type RawTemplate = {
        id: number | string;
        key: string;
        pillow_variant: string | null;
        updated_at: string;
        lines?: Array<{ item_id: number | string; quantity: number | string }> | null;
      };
      type BalanceRow = { item_id: number; on_hand: string | number | null };

      const [
        { data: itemsData, error: itemsError },
        { data: pillowData, error: pillowError },
        { data: bomData, error: bomError },
        { data: bolsterData, error: bolsterError },
        { data: productPricesData, error: productPricesError },
        { data: templateData, error: templateError },
        { data: balanceRows, error: balancesError },
      ] = await Promise.all([
        supabaseClient
          .from("items")
          .select("id,category,name,size,subtype,pricing:item_prices!left(cost_price,msrp,compare_at_price)")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true })
          .order("size", { ascending: true, nullsFirst: false })
          .order("subtype", { ascending: true, nullsFirst: false }),
        supabaseClient
          .from("pillow_products")
          .select("id,size,kind")
          .eq("is_active", true)
          .order("size", { ascending: true }),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
        supabaseClient.from("bolster_bom_lines").select("variant,item_id,quantity"),
        supabaseClient.from("product_prices").select("key,kind,product_id,variant,msrp,compare_at_price"),
        supabaseClient
          .from("bom_templates")
          .select("id,key,pillow_variant,updated_at,lines:bom_template_lines(item_id,quantity)")
          .eq("kind", "pillow")
          .eq("pillow_kind", "premium")
          .in("pillow_variant", PREMIUM_VARIANTS as unknown as string[])
          .order("updated_at", { ascending: false }),
        // ponytail: as-of-now KPIs from balances + item_prices only — no Shopify mirror
        supabaseClient.from("inventory_balances").select("item_id,on_hand"),
      ]);

      if (itemsError) throw new Error(itemsError.message);
      if (pillowError) throw new Error(pillowError.message);
      if (bomError) throw new Error(bomError.message);
      if (bolsterError) throw new Error(bolsterError.message);
      if (productPricesError) throw new Error(productPricesError.message);
      if (templateError) throw new Error(templateError.message);
      if (balancesError) throw new Error(balancesError.message);

      const balanceMap = new Map<number, number>();
      (balanceRows ?? []).forEach((row: BalanceRow) => {
        balanceMap.set(row.item_id, toNumber(row.on_hand) ?? 0);
      });

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
      const onHandUnits: Array<{ cost: number | null; msrp: number | null; onHand: number }> = [];

      rows.forEach((row) => {
        const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
        const costCents = toCents(pricing?.cost_price);
        const msrpCents = toCents(pricing?.msrp);
        const compareAtCents = toCents(pricing?.compare_at_price ?? null);
        const key = itemKey(row.id);
        nextDraft[key] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
          compareAt: formatFromCents(compareAtCents),
        };
        nextBaseline[key] = { cost: costCents, msrp: msrpCents, compareAt: compareAtCents };
        itemCostById.set(row.id, costCents);
        onHandUnits.push({
          cost: toNumber(pricing?.cost_price),
          msrp: toNumber(pricing?.msrp),
          onHand: balanceMap.get(row.id) ?? 0,
        });
      });
      setOnHandKpis(computeOnHandValueKpis(onHandUnits));

      const bomLines = (bomData ?? []) as RawBomLine[];
      const bolsterLines = (bolsterData ?? []) as RawBolsterLine[];
      const pillowProducts = (pillowData ?? []) as RawPillowRow[];
      const productPrices = (productPricesData ?? []) as RawProductPrice[];
      const templates = (templateData ?? []) as RawTemplate[];

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

      // Premium variant BOM templates (optional): pick the latest template per (size,variant).
      // We use these for displaying parts + computing cost for premium variant selection.
      const premiumTemplateComponentsBySizeVariant = new Map<string, ProductComponent[]>();
      for (const t of templates) {
        const sizeKey = String(t.key);
        const variant = String(t.pillow_variant ?? "").toLowerCase();
        if (!sizeKey) continue;
        if (variant !== "linen" && variant !== "fibrecool") continue;
        const k = `${sizeKey}:${variant}`;
        if (premiumTemplateComponentsBySizeVariant.has(k)) continue; // already have latest due to ordering
        const rawLines = Array.isArray(t.lines) ? t.lines : [];
        const components = rawLines
          .map((l) => ({
            itemId: Number(l.item_id),
            quantity: Number(l.quantity),
          }))
          .filter((c) => Number.isFinite(c.itemId) && c.itemId > 0 && Number.isFinite(c.quantity) && c.quantity > 0);
        premiumTemplateComponentsBySizeVariant.set(k, components);
      }

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
      const priceByKey = new Map<string, RawProductPrice>();
      productPrices.forEach((row) => {
        priceByKey.set(row.key, row);
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
          // Keep basic before premium when sizes match.
          const ak = String(a.kind || "basic");
          const bk = String(b.kind || "basic");
          if (ak !== bk) return ak.localeCompare(bk);
          return a.size.localeCompare(b.size);
        })
        .forEach((product) => {
          const components = bomByProduct.get(product.id) ?? [];
          const costCents = costForComponents(components);
          const pillowKind: PillowKind = String(product.kind) === "premium" ? "premium" : "basic";

          // Premium is priced PER CASE FABRIC FAMILY and so gets one editable row per
          // family; basic gets one unkeyed row. #131 collapsed premium to a single
          // price on the belief the fabric did not change the sell price — it does,
          // and the two do not share a base (XS 340 vs 360 imply cores of 250 and
          // 247). Two rows is not a special case here: each is an ordinary row with
          // its own key, so the draft, dirty check, sheet and save need no branch.
          const priceRows: Array<{ key: string; variant?: PremiumVariant; label: string }> =
            pillowKind === "premium"
              ? PREMIUM_VARIANTS.map((variant) => ({
                  key: premiumPillowKey(product.id, variant),
                  variant,
                  label: `Premium Pillow — ${product.size} (${PREMIUM_VARIANT_TITLES[variant]})`,
                }))
              : [{ key: pillowKey(product.id), label: `Basic Pillow — ${product.size}` }];

          priceRows.forEach(({ key, variant, label }) => {
            const price =
              priceByKey.get(key) ??
              (pillowKind === "premium" ? undefined : priceByProductId.get(product.id));
            const msrpCents = toCents(price?.msrp ?? null);
            const compareAtCents = toCents(price?.compare_at_price ?? null);
            productDraft[key] = {
              costPrice: formatFromCents(costCents),
              msrp: formatFromCents(msrpCents),
              compareAt: formatFromCents(compareAtCents),
            };
            productBaseline[key] = { cost: costCents, msrp: msrpCents, compareAt: compareAtCents };
            productRows.push({
              key,
              kind: "pillow",
              label,
              size: product.size as PillowSize,
              productId: product.id,
              pillowKind,
              premiumVariant: variant,
              costCents,
              msrpCents,
              components,
              ...(pillowKind === "premium"
                ? {
                    premiumComponentsByVariant: {
                      linen: premiumTemplateComponentsBySizeVariant.get(`${String(product.size)}:linen`) ?? components,
                      fibrecool: premiumTemplateComponentsBySizeVariant.get(`${String(product.size)}:fibrecool`) ?? components,
                    },
                  }
                : {}),
            });
          });
        });

      BOLSTER_VARIANTS.forEach((variant) => {
        const key = bolsterKey(variant);
        const components = bolsterByVariant[variant];
        const costCents = costForComponents(components);
        const price = priceByVariant.get(variant);
        const msrpCents = toCents(price?.msrp ?? null);
        const compareAtCents = toCents(price?.compare_at_price ?? null);
        productDraft[key] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
          compareAt: formatFromCents(compareAtCents),
        };
        productBaseline[key] = { cost: costCents, msrp: msrpCents, compareAt: compareAtCents };
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
      const loadedDraft = { ...nextDraft, ...productDraft };
      commitDraftDebounced.cancel();
      draftRef.current = loadedDraft;
      setDraft(loadedDraft);
      setCommittedDraft(loadedDraft);
      setHasPendingEdit(false);
      applyBaseline({ ...nextBaseline, ...productBaseline });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load costings";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [applyBaseline, commitDraftDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime bursts (a BOM edit touches several tables at once) are coalesced
  // into a single trailing reload instead of one `load()` per change event.
  const scheduleReload = useDebouncedCallback(() => {
    load();
  }, REALTIME_RELOAD_DEBOUNCE_MS);

  useEffect(() => {
    const channel = supabaseClient
      .channel("costings-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pillow_products" }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bom_lines" }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bolster_bom_lines" }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bom_templates" }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bom_template_lines" }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_prices" }, () => {
        scheduleReload();
      })
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [scheduleReload]);

  useEffect(() => {
    const handleInventoryChange = () => {
      scheduleReload();
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
  }, [scheduleReload]);

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

  const categoryTitleByKey = useMemo(() => {
    const map = new Map<string, string>();
    grouped.forEach((group) => {
      map.set(group.category, group.title);
    });
    return map;
  }, [grouped]);

  useEffect(() => {
    setPartFilters((prev) => prev.filter((category) => categoryTitleByKey.has(category)));
  }, [categoryTitleByKey]);

  const hasActiveFilters = partFilters.length > 0;

  const availableFilterCategories = useMemo(() => {
    const selected = new Set(partFilters);
    return grouped
      .filter((group) => !selected.has(group.category))
      .map((group) => ({ category: group.category, title: group.title }));
  }, [grouped, partFilters]);

  const activeFilterCategories = useMemo(() => {
    const selected = new Set(partFilters);
    return grouped
      .filter((group) => selected.has(group.category))
      .map((group) => ({ category: group.category, title: group.title }));
  }, [grouped, partFilters]);

  const visibleFilterCategories = useMemo(() => {
    if (filtersExpanded) return activeFilterCategories;
    if (collapsedVisibleFilterCount === null) return activeFilterCategories;
    return activeFilterCategories.slice(0, collapsedVisibleFilterCount);
  }, [activeFilterCategories, collapsedVisibleFilterCount, filtersExpanded]);

  const hiddenFilterCount = useMemo(() => {
    if (filtersExpanded) return 0;
    if (collapsedVisibleFilterCount === null) return 0;
    return Math.max(0, activeFilterCategories.length - collapsedVisibleFilterCount);
  }, [activeFilterCategories.length, collapsedVisibleFilterCount, filtersExpanded]);

  useLayoutEffect(() => {
    if (filtersExpanded) return;
    setCollapsedVisibleFilterCount(null);
  }, [activeFilterCategories, filtersExpanded]);

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
  }, [activeFilterCategories, filtersExpanded, filterMeasureVersion]);

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
    return grouped.filter((group) => selected.has(group.category));
  }, [grouped, partFilters]);

  const itemCostByIdFromDraft = useMemo(() => {
    const map = new Map<number, number | null>();
    items.forEach((item) => {
      const key = itemKey(item.id);
      const entry = committedDraft[key];
      const cents = parseToCents(entry?.costPrice ?? "");
      map.set(item.id, cents);
    });
    return map;
  }, [items, committedDraft]);

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

  const getPillowSizeLabel = (label: string) => {
    const parts = label
      .split(/[—–]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 1];
    return label.trim();
  };

  const renderProductCard = (product: ProductRow) => {
    const current = draft[product.key] ?? { costPrice: "", msrp: "", compareAt: "" };
    const costDisplay = productCostDisplay.get(product.key) ?? current.costPrice;
    const partsCount = product.components.filter((component) => component.quantity > 0).length;
    const primaryLabel =
      product.kind === "pillow"
        ? getPillowSizeLabel(product.label)
        : product.variant
        ? BOLSTER_VARIANT_TITLES[product.variant]
        : product.label;
    const secondaryLabel = product.kind === "pillow" ? "Pillow Size" : "Bolster Variant";
    return (
      <div
        key={product.key}
        role="button"
        tabIndex={0}
        className="space-y-2 rounded-lg border p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer select-none sm:space-y-3 sm:p-4"
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
          <div className="text-xl font-semibold sm:text-2xl">{primaryLabel}</div>
        </div>
        <div className="text-xs text-muted-foreground">{partsCount} parts configured</div>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="font-medium">{formatDraftCurrencyLabel(costDisplay)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MSRP</div>
            <div className="font-medium">{formatDraftCurrencyLabel(current.msrp)}</div>
          </div>
        </div>
        <div className="hidden sm:block">
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
    return draft[activeProduct.key] ?? { costPrice: "", msrp: "", compareAt: "" };
  }, [activeProduct, draft]);

  const activeProductComponentsSource = useMemo(() => {
    if (!activeProduct) return [];
    if (
      activeProduct.kind === "pillow" &&
      activeProduct.pillowKind === "premium" &&
      activeProduct.premiumComponentsByVariant
    ) {
      return (
        activeProduct.premiumComponentsByVariant[premiumVariantSelection] ??
        activeProduct.components
      );
    }
    return activeProduct.components;
  }, [activeProduct, premiumVariantSelection]);

  const activeProductCostDisplay = useMemo(() => {
    if (!activeProduct) return "";
    const fromComponents = computeProductComponentsCostCents(activeProductComponentsSource, itemCostByIdFromDraft);
    if (fromComponents !== null) {
      return formatFromCents(fromComponents);
    }
    const display = productCostDisplay.get(activeProduct.key);
    if (display && display !== "") {
      return display;
    }
    return formatFromCents(activeProduct.costCents ?? null);
  }, [activeProduct, productCostDisplay, itemCostByIdFromDraft, activeProductComponentsSource]);

  const activeProductComponents = useMemo(() => {
    if (!activeProduct) return [];
    const groups = new Map<string, ProductComponentGroup>();
    activeProductComponentsSource.forEach((component) => {
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
  }, [activeProduct, itemCostByIdFromDraft, itemMap, activeProductComponentsSource]);

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

  const handleInputChange = useCallback(
    (rowKey: string, field: keyof DraftRow, raw: string) => {
      const sanitized = sanitizeCurrencyInput(raw);
      applyDraft((prev) => {
        const current = prev[rowKey] ?? { costPrice: "", msrp: "", compareAt: "" };
        return {
          ...prev,
          [rowKey]: { ...current, [field]: sanitized },
        };
      });
      // Cheap dirty check for just the field that changed — the full comparison
      // still runs against `committedDraft` once the debounce lands.
      const baselineRow = baselineRef.current[rowKey];
      const baselineCents =
        field === "costPrice"
          ? (baselineRow?.cost ?? null)
          : field === "msrp"
          ? (baselineRow?.msrp ?? null)
          : (baselineRow?.compareAt ?? null);
      if (parseToCents(sanitized) !== baselineCents) {
        setHasPendingEdit(true);
      }
      commitDraftDebounced();
    },
    [applyDraft, commitDraftDebounced],
  );

  const handleBlur = useCallback(
    (rowKey: string, field: keyof DraftRow) => {
      applyDraft((prev) => {
        const current = prev[rowKey] ?? { costPrice: "", msrp: "", compareAt: "" };
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
      flushDraft();
    },
    [applyDraft, flushDraft],
  );

  const handleAddFilter = useCallback((category: string) => {
    if (!category) return;
    setPartFilters((prev) => (prev.includes(category) ? prev : [...prev, category]));
  }, []);

  const handleRemoveFilter = useCallback((category: string) => {
    setPartFilters((prev) => prev.filter((entry) => entry !== category));
  }, []);

  const clearFilters = useCallback(() => {
    setPartFilters([]);
  }, []);

  const committedIsDirty = useMemo(() => {
    const itemChanged = items.some((item) => {
      const key = itemKey(item.id);
      const current = committedDraft[key] ?? { costPrice: "", msrp: "", compareAt: "" };
      const baselineRow = baseline[key] ?? { cost: null, msrp: null, compareAt: null };
      const costCents = parseToCents(current.costPrice);
      const msrpCents = parseToCents(current.msrp);
      const compareAtCents = parseToCents(current.compareAt);
      return costCents !== baselineRow.cost || msrpCents !== baselineRow.msrp || compareAtCents !== baselineRow.compareAt;
    });
    if (itemChanged) return true;
    return products.some((product) => {
      const key = product.key;
      const current = committedDraft[key] ?? { costPrice: "", msrp: "", compareAt: "" };
      const baselineRow = baseline[key] ?? { cost: product.costCents ?? null, msrp: product.msrpCents ?? null, compareAt: null };
      const msrpCents = parseToCents(current.msrp);
      const compareAtCents = parseToCents(current.compareAt);
      return msrpCents !== baselineRow.msrp || compareAtCents !== baselineRow.compareAt;
    });
  }, [items, products, committedDraft, baseline]);

  // `hasPendingEdit` covers the debounce window so the Save button reacts to the
  // very first keystroke, exactly as it did when `isDirty` read `draft`.
  const isDirty = hasPendingEdit || committedIsDirty;

  const save = async () => {
    // Land any keystroke still inside the debounce window, then build the
    // payload from the live draft so nothing typed can be lost.
    flushDraft();
    const liveDraft = draftRef.current;
    const rows = items
      .map((item) => {
        const key = itemKey(item.id);
        const current = liveDraft[key] ?? { costPrice: "", msrp: "", compareAt: "" };
        const baselineRow = baseline[key] ?? { cost: null, msrp: null, compareAt: null };
        const costCents = parseToCents(current.costPrice);
        const msrpCents = parseToCents(current.msrp);
        const compareAtCents = parseToCents(current.compareAt);
        if (costCents === baselineRow.cost && msrpCents === baselineRow.msrp && compareAtCents === baselineRow.compareAt) {
          return null;
        }
        return {
          itemId: item.id,
          costPriceCents: costCents,
          msrpCents: msrpCents,
          compareAtCents,
        };
      })
      .filter((row): row is { itemId: number; costPriceCents: number | null; msrpCents: number | null; compareAtCents: number | null } => row !== null);

    const productPayload = products
      .flatMap((product) => {
        const key = product.key;
        const current = liveDraft[key] ?? { costPrice: "", msrp: "", compareAt: "" };
        const baselineRow = baseline[key] ?? { cost: product.costCents ?? null, msrp: product.msrpCents ?? null, compareAt: null };
        const msrpCents = parseToCents(current.msrp);
        const compareAtCents = parseToCents(current.compareAt);
        if (msrpCents === baselineRow.msrp && compareAtCents === baselineRow.compareAt) {
          return [];
        }
        const payload: ProductSaveRow = {
          key,
          kind: product.kind,
          msrpCents,
          compareAtCents,
        };
        if (product.kind === "pillow") {
          if (product.productId === undefined) {
            return [];
          }
          payload.productId = product.productId;
          // Carried through so the row lands on `product_prices.variant` — the column
          // the pricing loader selects on. Without it every premium save collapsed
          // back to one unkeyed row.
          if (product.premiumVariant) payload.variant = product.premiumVariant;
        }
        if (product.kind === "bolster") {
          if (!product.variant) {
            return [];
          }
          payload.variant = product.variant;
        }
        return [payload];
      });

    if (rows.length === 0 && productPayload.length === 0) {
      toast.message("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(settingsPath("/settings/costings/save"), {
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

  const syncPricesToShopify = async () => {
    setSyncingShopifyPrices(true);
    try {
      const res = await syncShopifyPricesOnly();
      const stats = res?.prices ?? null;
      toast.success(
        stats
          ? `Shopify prices synced (updated ${stats.updated}, skipped ${stats.skipped}, inactive ${stats.skipped_inactive})`
          : "Shopify prices synced",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync Shopify prices");
    } finally {
      setSyncingShopifyPrices(false);
    }
  };

  // Phones: the two refresh/sync actions move into the bottom dock. Save stays
  // in MobileStickyActionBar — it carries the "Unsaved changes" line, which a
  // dock icon cannot, and the bar only appears when there is something to save.
  useMobileDockActions([
    {
      id: "sync-shopify",
      title: syncingShopifyPrices ? "Syncing…" : "Sync prices to Shopify",
      icon: CloudUpload,
      onClick: () => void syncPricesToShopify(),
    },
    { id: "refresh", title: "Refresh", icon: RotateCw, onClick: () => void load() },
  ]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading costings…</div>;
  }

  if (items.length === 0 && products.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-2xl font-semibold">Costings</div>
        <p className="text-sm text-muted-foreground">No parts are currently active. Add items to begin tracking pricing.</p>
        <Button variant="secondary" onClick={load} disabled={saving}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className={isDirty ? `space-y-6 ${mobileStickyActionBarSpacerClassName}` : "space-y-6"}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Costings</h1>
          <p className="text-sm text-muted-foreground">
            Track cost price and MSRP for each part to keep your pricing consistent.
          </p>
        </div>
        <PageActions>
          <Button
            variant="secondary"
            className={cn(pageActionClassName, pageActionDockedClassName)}
            onClick={() => void syncPricesToShopify()}
            disabled={saving || syncingShopifyPrices}
          >
            {syncingShopifyPrices ? "Syncing…" : "Sync prices to Shopify"}
          </Button>
          <Button
            variant="secondary"
            className={cn(pageActionClassName, pageActionDockedClassName)}
            onClick={load}
            disabled={saving}
          >
            Refresh
          </Button>
          {/* Phones get Save from MobileStickyActionBar instead — `md`, the bar's
              own breakpoint, so the two never render at once on a wide phone. */}
          <Button
            className="hidden md:inline-flex"
            onClick={save}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </PageActions>
      </div>

      {onHandKpis && (
        <div className="space-y-2">
          <div>
            <h2 className="text-base font-medium">On-hand stock value</h2>
            <p className="text-sm text-muted-foreground">
              As of now — current warehouse stock × Costings prices (not a sales date range).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Inventory at cost</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{currencyFormatter.format(onHandKpis.costValue)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                Across {onHandKpis.totalItems} active items; reflects on-hand cost exposure.
              </CardContent>
            </Card>
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Potential revenue (MSRP)</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{currencyFormatter.format(onHandKpis.msrpValue)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                Assumes every stocked unit sells at full list price.
              </CardContent>
            </Card>
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Unrealized gross margin</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{currencyFormatter.format(onHandKpis.marginValue)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                Difference between current MSRP value and cost basis.
              </CardContent>
            </Card>
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Weighted gross margin %</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{formatPercent(onHandKpis.weightedMarginPct)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                Weighted by MSRP across all stocked SKUs with pricing coverage.
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-10">
        {products.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2>Products</h2>
              <p className="text-sm text-muted-foreground">
                Cost price is calculated from configured components. Enter MSRP and (optionally) compare-at for Shopify strikethrough pricing.
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
            <h2>Parts</h2>
            <p className="text-sm text-muted-foreground">
              Enter values as dollars. Leave blank to clear existing pricing for a part.
            </p>
          </div>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select closeOnSelect={false} onValueChange={handleAddFilter}>
                    <SelectTrigger
                      className="w-full max-w-full sm:w-[280px]"
                      aria-label="Filter parts by category"
                      disabled={availableFilterCategories.length === 0}
                    >
                      <SelectValue
                        placeholder={
                          availableFilterCategories.length === 0
                            ? "All categories are already filtered"
                            : "Select categories to filter"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <ScrollArea className="h-60">
                        <div className="p-1">
                          {availableFilterCategories.map((category) => (
                            <SelectItem
                              key={category.category}
                              value={category.category}
                              textValue={category.title}
                            >
                              {category.title}
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
                    Filtering {activeFilterCategories.length} categor{activeFilterCategories.length === 1 ? "y" : "ies"}
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
                            {activeFilterCategories.map((category) => (
                              <Button
                                key={`measure-${category.category}`}
                                variant="secondary"
                                size="sm"
                                className="gap-2 max-w-full"
                              >
                                <span className="truncate">{category.title}</span>
                                <X className="size-4 shrink-0" />
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="w-full rounded-md border bg-muted/30 p-2">
                      <div className="flex flex-wrap gap-2 min-w-0">
                        {visibleFilterCategories.map((category) => (
                          <Button
                            key={category.category}
                            variant="secondary"
                            size="sm"
                            className="gap-2 max-w-full"
                            onClick={() => handleRemoveFilter(category.category)}
                          >
                            <span className="truncate">{category.title}</span>
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
                <Section key={group.category} title={group.title} sticky>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={STICKY_PART_HEAD}>Part</TableHead>
                        <TableHead className={MONEY_HEAD}>Cost Price</TableHead>
                        <TableHead className={MONEY_HEAD}>MSRP</TableHead>
                        <TableHead className={MONEY_HEAD}>Compare-at</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => {
                        const current = draft[itemKey(item.id)] ?? EMPTY_DRAFT_ROW;
                        return (
                          <PartRow
                            key={item.id}
                            item={item}
                            costPrice={current.costPrice}
                            msrp={current.msrp}
                            compareAt={current.compareAt}
                            onChange={handleInputChange}
                            onBlur={handleBlur}
                          />
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
        <SheetContent side="right" className="flex w-full flex-col max-md:max-h-[92svh] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{activeProduct?.label ?? "Product details"}</SheetTitle>
            <SheetDescription>Review configured parts and adjust pricing.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            {activeProduct ? (
              <>
                <div className="space-y-4">
                  {activeProduct.kind === "pillow" && activeProduct.pillowKind === "premium" ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Component variant</div>
                      <Select
                        value={premiumVariantSelection}
                        onValueChange={(value) => {
                          if (value === "linen" || value === "fibrecool") {
                            setPremiumVariantSelection(value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full" aria-label="Select premium variant">
                          <SelectValue placeholder="Select variant…" />
                        </SelectTrigger>
                        <SelectContent>
                          {PREMIUM_VARIANTS.map((variant) => (
                            <SelectItem key={variant} value={variant}>
                              {PREMIUM_VARIANT_TITLES[variant]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">MSRP</div>
                      </div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={activeProductDraft?.msrp ?? ""}
                          placeholder="0.00"
                          onChange={(event) =>
                            handleInputChange(activeProduct.key, "msrp", event.target.value)
                          }
                          onBlur={() => handleBlur(activeProduct.key, "msrp")}
                          className="pl-6"
                          aria-label={`MSRP for ${activeProduct.label}`}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Compare-at</div>
                      </div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={activeProductDraft?.compareAt ?? ""}
                          placeholder="(optional)"
                          onChange={(event) =>
                            handleInputChange(activeProduct.key, "compareAt", event.target.value)
                          }
                          onBlur={() => handleBlur(activeProduct.key, "compareAt")}
                          className="pl-6"
                          aria-label={`Compare-at for ${activeProduct.label}`}
                        />
                      </div>
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
                              <TableHead className={STICKY_PART_HEAD}>Part</TableHead>
                              <TableHead className="min-w-[3.5rem] sm:w-[70px]">Qty</TableHead>
                              <TableHead className="min-w-[6rem] whitespace-nowrap sm:w-1/5 sm:min-w-0">Cost Each</TableHead>
                              <TableHead className="min-w-[6rem] whitespace-nowrap sm:w-1/5 sm:min-w-0">Total Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.rows.map((detail) => (
                              <TableRow key={detail.item.id}>
                                <TableCell className={STICKY_PART_CELL}>
                                  <InventoryItemLabel item={detail.item} />
                                </TableCell>
                                <TableCell className="tabular-nums">{detail.quantity}</TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums">{formatCentsLabel(detail.costEach)}</TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums">{formatCentsLabel(detail.totalCost)}</TableCell>
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

      {/* Phones: Save stays in reach however far down the parts list you are. */}
      {isDirty ? (
        <MobileStickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Unsaved changes</div>
              <div className="truncate text-xs text-muted-foreground">
                Edits stay in the form until you save.
              </div>
            </div>
            <Button size="lg" className="shrink-0" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </MobileStickyActionBar>
      ) : null}
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
            className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4"
            aria-expanded={isOpen}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{group.title}</div>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">{summaryLabel}</span>
              <ChevronDown
                className={`size-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {group.emptyState ?? `No ${group.title} products configured yet.`}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => renderProductCard(product))}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Section({
  title,
  children,
  sticky = false,
}: {
  title: string;
  children: ReactNode;
  /** Pin the title to the top of the viewport on phones while the list scrolls. */
  sticky?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className={
          sticky
            ? "sticky top-0 z-20 -mx-2 bg-background/95 px-2 py-2 text-sm font-medium text-muted-foreground backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
            : "text-sm font-medium text-muted-foreground"
        }
      >
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
