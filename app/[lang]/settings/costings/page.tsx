"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import {
  PageActions,
  pageActionClassName,
  pageActionDockedClassName,
} from "@/components/ui/page-actions";
import { useMobileDockActions } from "@/components/ui/page-dock-actions";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SheetGrid, type SheetColumn, type SheetEdit } from "@/components/ui/sheet-grid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetClose,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, ChevronRight, ChevronUp, RotateCw, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  InventoryItemLabel,
  getInventoryCategoryTitle,
  getInventoryItemDisplayLabel,
  getInventoryItemLabelParts,
} from "../inventory/item-label";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";
import { StatTile } from "@/components/settings/stat-tile";
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
import {
  buildCostOptions,
  costRange,
  familyCaseItemId,
  marginPct,
  swapComponent,
  type BuildCostOption,
  type BuildCosts,
} from "@/lib/costings/build-costs";
import { isInPillowAccessory } from "@/lib/spatial-fillings/filling-groups";
import { parseCostingsItems } from "@/lib/ecommerce/inventory-families";

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
  /** Case fabric family (`items.price_family`); selects a premium Costings row. */
  price_family?: string | null;
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

/** One Costings price row: a basic size, a bolster length, or a premium size in one case fabric. */
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
  defaultFillingTemplateId: number | null;
};

/**
 * One product card: a Composed sellable with every price row it carries. Premium
 * holds one row per case fabric, picked on the card, so a size is one card.
 */
type ProductCard = {
  key: string;
  kind: "pillow" | "bolster";
  label: string;
  primaryLabel: string;
  size?: PillowSize;
  pillowKind?: PillowKind;
  variant?: BolsterVariant;
  /** Configure card slug: `premium-XS`, `basic-M`, `bolster-short`. */
  configureSlug: string;
  components: ProductComponent[];
  defaultFillingTemplateId: number | null;
  priceRows: ProductRow[];
};

/** An active Filling Template with the sizes it serves and its Derived pack list. */
type FillingTemplate = {
  id: number;
  kind: "pillow" | "bolster";
  name: string;
  keys: string[];
  pack: Array<{ itemId: number; count: number }>;
};

/** A card's build in one price row: its parts, the case it ships, and a cost per Filling Template. */
type FamilyBuild = {
  row: ProductRow;
  family: PremiumVariant | null;
  components: ProductComponent[];
  /** Premium only: no active case of this fabric exists at this size, so it cannot be built. */
  missingCase: boolean;
  costs: BuildCosts;
};

type CardBuild = {
  families: FamilyBuild[];
  defaultTemplateName: string | null;
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
  filter: (card: ProductCard) => boolean;
  countLabel?: string;
  defaultOpen?: boolean;
  emptyState?: string;
};

const PRODUCT_GROUP_DEFINITIONS: ProductGroupDefinition[] = [
  {
    key: "basic",
    title: "Basic Mpillow",
    description: "One price per size. Build cost depends on the filling template.",
    filter: (card) => card.kind === "pillow" && card.pillowKind === "basic",
    countLabel: "sizes",
    defaultOpen: true,
  },
  {
    key: "premium",
    title: "Premium Mpillow",
    description: "Each case fabric has its own price. Build cost depends on the filling template.",
    filter: (card) => card.kind === "pillow" && card.pillowKind === "premium",
    countLabel: "sizes",
    emptyState: "No premium Mpillow sizes yet.",
  },
  {
    key: "bolster",
    title: "Mbolster",
    description: "Priced by length. Build cost depends on the filling template.",
    filter: (card) => card.kind === "bolster",
    countLabel: "lengths",
    emptyState: "No bolster lengths yet.",
  },
];

const getPillowSizeIndex = (value?: PillowSize): number =>
  value ? PILLOW_SIZE_ORDER.get(value) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

const getBolsterVariantIndex = (value?: BolsterVariant): number =>
  value ? BOLSTER_VARIANT_ORDER.get(value) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

const sortProductCards = (items: ProductCard[]): ProductCard[] =>
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

/** Category order inside a build breakdown: what the pillow is, then what it ships in. */
const BUILD_CATEGORY_ORDER = [
  "cover",
  "case",
  "pillow_case",
  "bolster_case",
  "protector",
  "pillow_protector",
  "bolster_protector",
  "filling",
  "accessories",
  "packaging",
];

/** The case categories, as `lib/results/composed-sellable` reads them. */
const CASE_CATEGORIES = new Set(["case", "pillow_case", "bolster_case"]);

const FILTER_TAG_COLLAPSED_ROW_LIMIT = 3;

/** Money columns: wide enough for "$ 123.45" on a phone, fluid on desktop. */

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
  if (cents === null) return "Not set";
  return `$${formatFromCents(cents)}`;
};

const formatDraftCurrencyLabel = (value: string | undefined): string => {
  if (!value || value.trim() === "") return "Not set";
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

const formatCentsRange = (range: { min: number; max: number } | null): string => {
  if (!range) return "Not set";
  if (range.min === range.max) return formatCentsLabel(range.min);
  return `${formatCentsLabel(range.min)} to ${formatCentsLabel(range.max)}`;
};

const formatMarginRange = (values: Array<number | null>): string | null => {
  const known = values.filter((v): v is number => v !== null).map((v) => Math.round(v));
  if (known.length === 0) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  return min === max ? `${min}%` : `${min}% to ${max}%`;
};

/** Margin of one build at a row's MSRP. A Neck support inside it is in that price, and its cost in the build. */
const optionMargin = (option: BuildCostOption, msrpCents: number | null): number | null =>
  marginPct(msrpCents, option.buildCents);

/** What a price row's builds cost; none when the row cannot be built at all. */
const buildCostCents = (build: FamilyBuild): number[] => {
  if (build.missingCase) return [];
  return build.costs.options.length > 0
    ? build.costs.options.map((option) => option.buildCents)
    : [build.costs.baseCents];
};

const EMPTY_DRAFT_ROW: DraftRow = { costPrice: "", msrp: "", compareAt: "" };

const PART_COLUMNS: SheetColumn[] = [
  { key: "costPrice", label: "Cost price", placeholder: "$0.00", prefix: "$" },
  { key: "msrp", label: "MSRP", placeholder: "$0.00", prefix: "$" },
  { key: "compareAt", label: "Compare-at", placeholder: "(optional)", prefix: "$" },
];

const BASELINE_FIELD: Record<keyof DraftRow, "cost" | "msrp" | "compareAt"> = {
  costPrice: "cost",
  msrp: "msrp",
  compareAt: "compareAt",
};

/** The query string never changes under this page except through `clearFocus`, which also sets state. */
const subscribeToNothing = () => () => {};
const readLocationSearch = () => window.location.search;

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
  /**
   * Items the Inventory page sent here (`?items=`) to be priced: the parts list
   * shows just these until Staff ask for everything. Read from the URL after
   * mount, so the page needs no Suspense boundary for `useSearchParams`.
   */
  const search = useSyncExternalStore(subscribeToNothing, readLocationSearch, () => "");
  const [showAllParts, setShowAllParts] = useState(false);
  const focusItemIds = useMemo(
    () => (showAllParts ? [] : parseCostingsItems(search)),
    [search, showAllParts],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productSheetKey, setProductSheetKey] = useState<string | null>(null);
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  /** Phones edit one part's prices in a sheet; the spreadsheet grid is `md` and up. */
  const [partSheetItemId, setPartSheetItemId] = useState<number | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [collapsedVisibleFilterCount, setCollapsedVisibleFilterCount] = useState<number | null>(null);
  const [filterMeasureVersion, setFilterMeasureVersion] = useState(0);
  const filterMeasureRef = useRef<HTMLDivElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [fillingTemplates, setFillingTemplates] = useState<FillingTemplate[]>([]);
  const [fillingTemplatesError, setFillingTemplatesError] = useState<string | null>(null);
  // The case fabric and Filling Template the open sheet is previewing. A null
  // template means the card's first build: its default, else its cheapest.
  const [sheetFamily, setSheetFamily] = useState<PremiumVariant>("linen");
  const [sheetTemplateId, setSheetTemplateId] = useState<number | null>(null);
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
      type RawPillowRow = {
        id: number;
        size: string;
        kind: PillowKind | string | null;
        default_filling_template_id: number | null;
      };
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
      type RawBolsterConfig = { variant: string; default_filling_template_id: number | null };
      type BalanceRow = { item_id: number; on_hand: string | number | null };

      // Placements are service-role only, so the Derived pack lists come from the
      // server. Not fatal: prices still load and edit without them.
      const templatesRequest = fetch(settingsPath("/settings/costings/builds"), { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.error ?? "Couldn't load Filling Templates.");
          }
          return { templates: payload.templates as FillingTemplate[], error: null };
        })
        .catch((err: unknown) => ({
          templates: [] as FillingTemplate[],
          error: err instanceof Error ? err.message : "Couldn't load Filling Templates.",
        }));

      const [
        { data: itemsData, error: itemsError },
        { data: pillowData, error: pillowError },
        { data: bomData, error: bomError },
        { data: bolsterData, error: bolsterError },
        { data: productPricesData, error: productPricesError },
        { data: bolsterConfigData, error: bolsterConfigError },
        { data: balanceRows, error: balancesError },
        templatesResult,
      ] = await Promise.all([
        supabaseClient
          .from("items")
          .select("id,category,name,size,subtype,price_family,pricing:item_prices!left(cost_price,msrp,compare_at_price)")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true })
          .order("size", { ascending: true, nullsFirst: false })
          .order("subtype", { ascending: true, nullsFirst: false }),
        supabaseClient
          .from("pillow_products")
          .select("id,size,kind,default_filling_template_id")
          .eq("is_active", true)
          .order("size", { ascending: true }),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
        supabaseClient.from("bolster_bom_lines").select("variant,item_id,quantity"),
        supabaseClient.from("product_prices").select("key,kind,product_id,variant,msrp,compare_at_price"),
        supabaseClient.from("bolster_length_config").select("variant,default_filling_template_id"),
        // ponytail: as-of-now KPIs from balances + item_prices only — no Shopify mirror
        supabaseClient.from("inventory_balances").select("item_id,on_hand"),
        templatesRequest,
      ]);

      if (itemsError) throw new Error(itemsError.message);
      if (pillowError) throw new Error(pillowError.message);
      if (bomError) throw new Error(bomError.message);
      if (bolsterError) throw new Error(bolsterError.message);
      if (productPricesError) throw new Error(productPricesError.message);
      if (bolsterConfigError) throw new Error(bolsterConfigError.message);
      if (balancesError) throw new Error(balancesError.message);

      const balanceMap = new Map<number, number>();
      (balanceRows ?? []).forEach((row: BalanceRow) => {
        balanceMap.set(row.item_id, toNumber(row.on_hand) ?? 0);
      });

      const rows = (itemsData ?? []) as RawItemRow[];
      const nextItems = rows.map(({ id, category, name, size, subtype, price_family }) => ({
        id,
        category,
        name,
        size,
        subtype,
        price_family: price_family ?? null,
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
      const bolsterDefaults = new Map<string, number | null>(
        ((bolsterConfigData ?? []) as RawBolsterConfig[]).map((row) => [
          row.variant,
          row.default_filling_template_id == null ? null : Number(row.default_filling_template_id),
        ]),
      );

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
                  label: `Premium Mpillow ${product.size}, ${PREMIUM_VARIANT_TITLES[variant]}`,
                }))
              : [{ key: pillowKey(product.id), label: `Basic Mpillow ${product.size}` }];

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
              defaultFillingTemplateId:
                product.default_filling_template_id == null ? null : Number(product.default_filling_template_id),
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
          label: `Mbolster ${BOLSTER_VARIANT_TITLES[variant]}`,
          variant,
          costCents,
          msrpCents,
          components,
          defaultFillingTemplateId: bolsterDefaults.get(variant) ?? null,
        });
      });

      setItems(nextItems);
      setProducts(productRows);
      setFillingTemplates(templatesResult.templates);
      setFillingTemplatesError(templatesResult.error);
      const loadedDraft = { ...nextDraft, ...productDraft };
      commitDraftDebounced.cancel();
      draftRef.current = loadedDraft;
      setDraft(loadedDraft);
      setCommittedDraft(loadedDraft);
      setHasPendingEdit(false);
      applyBaseline({ ...nextBaseline, ...productBaseline });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load costings.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [applyBaseline, commitDraftDebounced, settingsPath]);

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
    const selected = new Set(partFilters);
    const byCategory = partFilters.length === 0 ? grouped : grouped.filter((group) => selected.has(group.category));
    if (focusItemIds.length === 0) return byCategory;
    const focus = new Set(focusItemIds);
    return byCategory
      .map((group) => ({ ...group, items: group.items.filter((item) => focus.has(item.id)) }))
      .filter((group) => group.items.length > 0);
  }, [grouped, partFilters, focusItemIds]);

  const clearFocus = useCallback(() => {
    setShowAllParts(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("items");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // Land on the parts the Inventory page sent, not the product cards above them.
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (loading || focusItemIds.length === 0 || focusedOnce.current) return;
    focusedOnce.current = true;
    document.getElementById("costings-parts")?.scrollIntoView({ block: "start" });
  }, [loading, focusItemIds]);

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

  const productCards = useMemo(() => {
    const byKey = new Map<string, ProductCard>();
    for (const row of products) {
      const cardKey = row.kind === "pillow" ? `card:pillow:${row.productId}` : `card:bolster:${row.variant}`;
      const existing = byKey.get(cardKey);
      if (existing) {
        existing.priceRows.push(row);
        continue;
      }
      const pillowKind = row.pillowKind ?? "basic";
      const lengthTitle = row.variant ? BOLSTER_VARIANT_TITLES[row.variant] : row.label;
      byKey.set(cardKey, {
        key: cardKey,
        kind: row.kind,
        label:
          row.kind === "pillow"
            ? `${pillowKind === "premium" ? "Premium" : "Basic"} Mpillow ${row.size}`
            : `Mbolster ${lengthTitle}`,
        primaryLabel: row.kind === "pillow" ? String(row.size ?? row.label) : lengthTitle,
        size: row.size,
        pillowKind: row.pillowKind,
        variant: row.variant,
        configureSlug: row.kind === "pillow" ? `${pillowKind}-${row.size}` : `bolster-${row.variant}`,
        components: row.components,
        defaultFillingTemplateId: row.defaultFillingTemplateId,
        priceRows: [row],
      });
    }
    return Array.from(byKey.values());
  }, [products]);

  // Each card's cost in every price row, once per Filling Template serving its size.
  // Keyed off `committedDraft` like the memos above, so an edited part cost or case
  // MSRP moves every build that uses it as soon as the debounce lands.
  const cardBuilds = useMemo(() => {
    const msrpCentsOf = (itemId: number) => parseToCents(committedDraft[itemKey(itemId)]?.msrp ?? "");
    // Every accessory placed in the pillow (a Neck support, an Ear Comfort Pad) is in its price.
    const neckSupportItemIds = new Set(items.filter((item) => isInPillowAccessory(item)).map((item) => item.id));
    const caseItems = items.filter((item) => CASE_CATEGORIES.has(item.category));
    const map = new Map<string, CardBuild>();
    for (const card of productCards) {
      const scope = card.kind === "pillow" ? card.size : card.variant;
      const templates = fillingTemplates.filter(
        (template) => template.kind === card.kind && scope !== undefined && template.keys.includes(scope),
      );
      const bomCaseLine = card.components.find((component) =>
        CASE_CATEGORIES.has(itemMap.get(component.itemId)?.category ?? ""),
      );
      const bomCaseItem = bomCaseLine ? itemMap.get(bomCaseLine.itemId) : undefined;
      const families = card.priceRows.map((row): FamilyBuild => {
        let components = card.components;
        let missingCase = false;
        if (row.premiumVariant) {
          // Each fabric's row was priced with that fabric's case, so its build ships
          // that case, whichever one the BOM happens to carry.
          const caseItemId = familyCaseItemId({
            bomCase: bomCaseItem
              ? { itemId: bomCaseItem.id, family: bomCaseItem.price_family ?? null, msrpCents: msrpCentsOf(bomCaseItem.id) }
              : null,
            family: row.premiumVariant,
            candidates: caseItems
              .filter((item) => item.size === card.size || item.size === null)
              .map((item) => ({ itemId: item.id, family: item.price_family ?? null, msrpCents: msrpCentsOf(item.id) })),
          });
          if (caseItemId === null) missingCase = true;
          else if (bomCaseLine) components = swapComponent(card.components, bomCaseLine.itemId, caseItemId);
          else components = [...card.components, { itemId: caseItemId, quantity: 1 }];
        }
        return {
          row,
          family: row.premiumVariant ?? null,
          components,
          missingCase,
          costs: buildCostOptions({
            baseComponents: components,
            // A fabric with no case here cannot be built, so it has no build to cost.
            templates: missingCase ? [] : templates,
            defaultTemplateId: card.defaultFillingTemplateId,
            costByItem: itemCostByIdFromDraft,
            neckSupportItemIds,
            allowNeckSupport: card.kind === "pillow" && card.pillowKind === "premium",
          }),
        };
      });
      map.set(card.key, {
        families,
        defaultTemplateName: families[0]?.costs.options.find((option) => option.isDefault)?.name ?? null,
      });
    }
    return map;
  }, [productCards, fillingTemplates, items, itemMap, itemCostByIdFromDraft, committedDraft]);

  const groupedProducts = useMemo(() => {
    const assigned = new Set<string>();
    return PRODUCT_GROUP_DEFINITIONS.map((group) => {
      const cards = productCards.filter((card) => {
        if (assigned.has(card.key)) return false;
        if (!group.filter(card)) return false;
        assigned.add(card.key);
        return true;
      });
      return { ...group, cards: sortProductCards(cards) };
    });
  }, [productCards]);

  const handleGroupOpenChange = useCallback((groupKey: ProductGroupKey, open: boolean) => {
    setGroupOpenStates((prev) => ({ ...prev, [groupKey]: open }));
  }, []);

  const renderProductCard = (card: ProductCard) => {
    const build = cardBuilds.get(card.key);
    const families = build?.families ?? [];
    const range = costRange(families.flatMap(buildCostCents));
    const templateCount = families[0]?.costs.options.length ?? 0;
    const secondaryLabel = card.kind === "pillow" ? "Pillow size" : "Bolster length";
    const msrpLabel = (row: ProductRow) => formatDraftCurrencyLabel(draft[row.key]?.msrp);
    return (
      <div
        key={card.key}
        role="button"
        tabIndex={0}
        className="space-y-2 rounded-lg border p-3 hover:bg-muted/50 active:bg-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer select-none max-md:-mx-3 max-md:rounded-none max-md:border-0 max-md:px-3 md:space-y-3 md:p-4"
        onClick={() => openProductSheet(card.key)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openProductSheet(card.key);
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground max-md:hidden">{secondaryLabel}</div>
            <div className="text-lg font-semibold md:text-2xl">{card.primaryLabel}</div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground md:hidden" aria-hidden />
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <div>{templateCount === 1 ? "1 filling template" : `${templateCount} filling templates`}</div>
          {/* A phone row is full width, so the template name wraps rather than truncating. */}
          <div className="break-words md:truncate">
            {build?.defaultTemplateName ? `Default is ${build.defaultTemplateName}` : "No default set"}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Build cost</div>
            <div className="font-medium tabular-nums">{formatCentsRange(range)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MSRP</div>
            {card.priceRows.length > 1 ? (
              <div className="space-y-0.5">
                {card.priceRows.map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {row.premiumVariant ? PREMIUM_VARIANT_TITLES[row.premiumVariant] : row.label}
                    </span>
                    <span className="font-medium tabular-nums">{msrpLabel(row)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-medium tabular-nums">{card.priceRows[0] ? msrpLabel(card.priceRows[0]) : "Not set"}</div>
            )}
          </div>
        </div>
        <div className="hidden md:block">
          <Button size="sm" variant="secondary">
            View details
          </Button>
        </div>
      </div>
    );
  };

  const activeCard = useMemo(() => {
    if (!productSheetKey) return null;
    return productCards.find((card) => card.key === productSheetKey) ?? null;
  }, [productSheetKey, productCards]);

  const partSheetItem = partSheetItemId === null ? null : itemMap.get(partSheetItemId) ?? null;
  const partSheetLabel = partSheetItem ? getInventoryItemLabelParts(partSheetItem) : null;

  const activeBuild = activeCard ? cardBuilds.get(activeCard.key) ?? null : null;
  const activeFamily =
    activeBuild?.families.find((build) => build.family === sheetFamily) ?? activeBuild?.families[0] ?? null;
  const activeOptions = activeFamily?.costs.options ?? [];
  const activeOption =
    activeOptions.find((option) => option.templateId === sheetTemplateId) ?? activeOptions[0] ?? null;
  const activeRowDraft = activeFamily ? draft[activeFamily.row.key] ?? EMPTY_DRAFT_ROW : null;
  const activeMsrpCents = parseToCents(activeRowDraft?.msrp ?? "");

  /** A build's lines grouped by category, in build order, with their costs. */
  const groupBuildLines = useCallback(
    (components: ProductComponent[]): ProductComponentGroup[] => {
      const groups = new Map<string, ProductComponentGroup>();
      components.forEach((component) => {
        if (component.quantity <= 0) return;
        // Costings loads active Items only, but a BOM can still point at an
        // inactive one. It is listed rather than dropped, so a cost it leaves
        // out is visible.
        const item = itemMap.get(component.itemId) ?? {
          id: component.itemId,
          category: "inactive",
          name: `Item ${component.itemId}`,
          size: null,
          subtype: null,
        };
        const group = groups.get(item.category) ?? {
          key: item.category,
          title: getInventoryCategoryTitle(item.category),
          rows: [],
        };
        const costEach = itemCostByIdFromDraft.get(item.id) ?? null;
        group.rows.push({
          item,
          quantity: component.quantity,
          costEach,
          totalCost: costEach !== null ? costEach * component.quantity : null,
        });
        groups.set(item.category, group);
      });
      const sortIndex = (category: string) => {
        const index = BUILD_CATEGORY_ORDER.indexOf(category);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      };
      return Array.from(groups.values())
        .sort((left, right) => sortIndex(left.key) - sortIndex(right.key) || left.title.localeCompare(right.title))
        .map((group) => ({
          ...group,
          rows: group.rows.sort((a, b) =>
            getInventoryItemDisplayLabel(a.item).localeCompare(getInventoryItemDisplayLabel(b.item)),
          ),
        }));
    },
    [itemMap, itemCostByIdFromDraft],
  );

  const activePartGroups = activeFamily ? groupBuildLines(activeFamily.components) : [];
  const activeFillingGroups = activeOption ? groupBuildLines(activeOption.lines) : [];

  const openProductSheet = useCallback((cardKey: string) => {
    setProductSheetKey(cardKey);
    setSheetFamily("linen");
    setSheetTemplateId(null);
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

  /** Grid edits land formatted to cents, like a blurred input. */
  const handleGridChange = useCallback(
    (edits: SheetEdit[]) => {
      applyDraft((prev) => {
        const next = { ...prev };
        for (const { rowId, colKey, value } of edits) {
          const cents = parseToCents(sanitizeCurrencyInput(value));
          const current = next[rowId] ?? EMPTY_DRAFT_ROW;
          next[rowId] = { ...current, [colKey]: cents === null ? "" : (cents / 100).toFixed(2) };
        }
        return next;
      });
      flushDraft();
    },
    [applyDraft, flushDraft],
  );

  const isPartCellDirty = useCallback(
    (rowKey: string, colKey: string) => {
      const field = colKey as keyof DraftRow;
      const cents = parseToCents((draft[rowKey] ?? EMPTY_DRAFT_ROW)[field]);
      return cents !== (baseline[rowKey]?.[BASELINE_FIELD[field]] ?? null);
    },
    [draft, baseline],
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
        const message = payload?.error ?? "Couldn't save costings.";
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
      const message = err instanceof Error ? err.message : "Couldn't save costings.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Phones: Refresh moves into the bottom dock. Save stays in
  // MobileStickyActionBar — it carries the "Unsaved changes" line, which a
  // dock icon cannot, and the bar only appears when there is something to save.
  useMobileDockActions([
    { id: "refresh", title: "Refresh", icon: RotateCw, onClick: () => void load() },
  ]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading costings…</div>;
  }

  if (items.length === 0 && products.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-2xl font-semibold">Costings</div>
        <p className="text-sm text-muted-foreground">No active parts yet. Add items in Inventory first.</p>
        <Button variant="secondary" onClick={load} disabled={saving}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className={isDirty ? `space-y-6 ${mobileStickyActionBarSpacerClassName}` : "space-y-6"}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1.5">
          <h1>Costings</h1>
          <InfoTip label="About Costings">
            Set cost and MSRP for every item and product.
          </InfoTip>
        </div>
        <PageActions>
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
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-medium">On-hand stock value</h2>
            <InfoTip label="About On-hand stock value">
              Values today&apos;s warehouse stock at Costings prices, not over a sales date range.
            </InfoTip>
          </div>
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <StatTile label="Inventory at cost" value={currencyFormatter.format(onHandKpis.costValue)} />
            <StatTile label="Potential revenue (MSRP)" value={currencyFormatter.format(onHandKpis.msrpValue)} />
            <StatTile label="Unrealized gross margin" value={currencyFormatter.format(onHandKpis.marginValue)} />
            <StatTile label="Weighted gross margin %" value={formatPercent(onHandKpis.weightedMarginPct)} />
          </div>
          <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Inventory at cost</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{currencyFormatter.format(onHandKpis.costValue)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                Covers {onHandKpis.totalItems} active items.
              </CardContent>
            </Card>
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Potential revenue (MSRP)</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{currencyFormatter.format(onHandKpis.msrpValue)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                Assumes every stocked unit sells at MSRP.
              </CardContent>
            </Card>
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Unrealized gross margin</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{currencyFormatter.format(onHandKpis.marginValue)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                It&apos;s the MSRP value minus cost.
              </CardContent>
            </Card>
            <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
              <CardHeader className="space-y-1 px-4 sm:px-6">
                <CardDescription>Weighted gross margin %</CardDescription>
                <CardTitle className="text-lg tabular-nums sm:text-2xl">{formatPercent(onHandKpis.weightedMarginPct)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground sm:px-6">
                It&apos;s the unrealized margin as a share of MSRP value.
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-10">
        {products.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-1.5">
              <h2>Products</h2>
              <InfoTip label="About Products">
                Build cost is the parts plus the filling template a build is assigned. Enter MSRP, plus compare-at
                for a strikethrough price.
              </InfoTip>
            </div>
            <div className="space-y-4">
              {groupedProducts.map((group) => (
                <ProductGroupSection
                  key={group.key}
                  group={group}
                  cards={group.cards}
                  isOpen={Boolean(groupOpenStates[group.key])}
                  onOpenChange={(open) => handleGroupOpenChange(group.key, open)}
                  renderProductCard={renderProductCard}
                />
              ))}
            </div>
          </section>
        )}

        <section id="costings-parts" className="scroll-mt-20 space-y-4">
          <div className="flex items-center gap-1.5">
            <h2>Parts</h2>
            <InfoTip label="About Parts">
              Enter dollars. Leave a field blank to clear it.
            </InfoTip>
          </div>
          {focusItemIds.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {focusItemIds.length === 1 ? "the item" : `${focusItemIds.length} items`} from
                Inventory. Enter the cost and MSRP, then save. Back in Inventory, the item is ready to
                push to Products.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={settingsPath("/settings/inventory")}>Back to Inventory</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={clearFocus}>
                  Show all parts
                </Button>
              </div>
            </div>
          )}
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
                  {/* A spreadsheet doesn't fit a phone (36px cells, a keyboard hint, a fourth
                      column cut off), so phones list the parts and edit one in a sheet. */}
                  <div className="hidden md:block">
                    <SheetGrid
                      label={`${group.title} prices`}
                      leadHead="Part"
                      columns={PART_COLUMNS}
                      rows={group.items.map((item) => ({
                        id: itemKey(item.id),
                        label: getInventoryItemDisplayLabel(item),
                        header: <InventoryItemLabel item={item} />,
                      }))}
                      value={(rowKey, colKey) => (draft[rowKey] ?? EMPTY_DRAFT_ROW)[colKey as keyof DraftRow]}
                      isDirty={isPartCellDirty}
                      onChange={handleGridChange}
                    />
                  </div>
                  <MobileList>
                    {group.items.map((item) => {
                      const rowKey = itemKey(item.id);
                      const row = draft[rowKey] ?? EMPTY_DRAFT_ROW;
                      return (
                        <MobileListRow key={rowKey} onClick={() => setPartSheetItemId(item.id)}>
                          <InventoryItemLabel item={item} groupedByCategory />
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                            {PART_COLUMNS.map((col) => {
                              const value = row[col.key as keyof DraftRow];
                              return (
                                <span
                                  key={col.key}
                                  className={cn(
                                    isPartCellDirty(rowKey, col.key) && "font-semibold text-amber-600 dark:text-amber-400",
                                  )}
                                >
                                  {col.label} {value === "" ? "–" : `${col.prefix ?? ""}${value}`}
                                </span>
                              );
                            })}
                          </div>
                        </MobileListRow>
                      );
                    })}
                  </MobileList>
                </Section>
              ))
            )}
          </div>
        </section>
      </div>

      <Sheet open={partSheetItem !== null} onOpenChange={(open) => { if (!open) setPartSheetItemId(null); }}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {partSheetLabel
                ? `${partSheetLabel.variant}${partSheetLabel.sizeLabel ? ` (${partSheetLabel.sizeLabel})` : ""}`
                : "Part"}
            </SheetTitle>
            <SheetDescription>
              {partSheetLabel ? `${partSheetLabel.categoryTitle}. ` : null}Enter dollars. Leave a field blank to clear it.
            </SheetDescription>
          </SheetHeader>
          {partSheetItem ? (
            <div className="grid gap-4 px-4">
              {PART_COLUMNS.map((col) => {
                const rowKey = itemKey(partSheetItem.id);
                const field = col.key as keyof DraftRow;
                return (
                  <PriceInput
                    key={col.key}
                    label={col.label}
                    value={(draft[rowKey] ?? EMPTY_DRAFT_ROW)[field]}
                    placeholder={field === "compareAt" ? "(optional)" : "0.00"}
                    onChange={(value) => handleInputChange(rowKey, field, value)}
                    onBlur={() => handleBlur(rowKey, field)}
                    ariaLabel={`${col.label} for ${getInventoryItemDisplayLabel(partSheetItem)}`}
                  />
                );
              })}
            </div>
          ) : null}
          <SheetFooter>
            <SheetClose asChild>
              <Button>Done</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={productSheetOpen && Boolean(activeCard)} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col max-md:max-h-[92svh] sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{activeCard?.label ?? "Product details"}</SheetTitle>
            <SheetDescription>Set the price, then compare what each filling template costs to build.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            {activeCard && activeBuild && activeFamily && activeRowDraft ? (
              <>
                <div className="space-y-4">
                  {activeBuild.families.length > 1 ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Case fabric</div>
                      <div role="radiogroup" aria-label="Case fabric" className="grid grid-cols-2 gap-2">
                        {activeBuild.families.map((build) => {
                          const title = build.family ? PREMIUM_VARIANT_TITLES[build.family] : build.row.label;
                          const selected = build === activeFamily;
                          const msrpCents = parseToCents(draft[build.row.key]?.msrp ?? "");
                          const margin = formatMarginRange(
                            build.costs.options.map((option) => optionMargin(option, msrpCents)),
                          );
                          return (
                            <button
                              key={build.row.key}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => build.family && setSheetFamily(build.family)}
                              className={cn(
                                "space-y-1 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected ? "border-primary bg-primary/5" : "border-border",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{title}</span>
                                {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-lg font-semibold tabular-nums">{formatCentsLabel(msrpCents)}</span>
                                <span className="text-xs text-muted-foreground">MSRP</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {build.missingCase
                                  ? `No ${title} case at this size`
                                  : `Build ${formatCentsRange(costRange(buildCostCents(build)))}`}
                              </div>
                              {margin ? <div className="text-xs text-muted-foreground">Margin {margin}</div> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <PriceInput
                      label={activeFamily.family ? `${PREMIUM_VARIANT_TITLES[activeFamily.family]} MSRP` : "MSRP"}
                      value={activeRowDraft.msrp}
                      placeholder="0.00"
                      onChange={(value) => handleInputChange(activeFamily.row.key, "msrp", value)}
                      onBlur={() => handleBlur(activeFamily.row.key, "msrp")}
                      ariaLabel={`MSRP for ${activeFamily.row.label}`}
                    />
                    <PriceInput
                      label={
                        activeFamily.family ? `${PREMIUM_VARIANT_TITLES[activeFamily.family]} compare-at` : "Compare-at"
                      }
                      value={activeRowDraft.compareAt}
                      placeholder="(optional)"
                      onChange={(value) => handleInputChange(activeFamily.row.key, "compareAt", value)}
                      onBlur={() => handleBlur(activeFamily.row.key, "compareAt")}
                      ariaLabel={`Compare-at for ${activeFamily.row.label}`}
                    />
                  </div>
                </div>

                <Separator />

                {activeFamily.missingCase && activeFamily.family ? (
                  <p className="text-sm text-muted-foreground">
                    There is no active {PREMIUM_VARIANT_TITLES[activeFamily.family]} case at this size, so this fabric
                    cannot be built here yet.
                  </p>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-medium">Build cost by filling template</h3>
                          <InfoTip label="About build cost">
                            A build costs its parts plus the filling template it is assigned. A neck support inside a
                            Premium Mpillow is in its price: it adds to the cost, never to the price. Basic Mpillow is
                            built without one.
                          </InfoTip>
                        </div>
                        {activeOptions.length > 1 ? (
                          <span className="text-xs text-muted-foreground">
                            {formatCentsRange(costRange(activeOptions.map((option) => option.buildCents)))} across{" "}
                            {activeOptions.length} templates
                          </span>
                        ) : null}
                      </div>
                      {fillingTemplatesError ? (
                        <p className="text-sm text-destructive">{fillingTemplatesError}</p>
                      ) : activeOptions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No filling template serves this {activeCard.kind === "pillow" ? "size" : "length"} yet, so the
                          cost below is its parts alone.
                        </p>
                      ) : (
                        <div role="radiogroup" aria-label="Filling templates" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {activeOptions.map((option) => {
                            const selected = option.templateId === activeOption?.templateId;
                            const margin = optionMargin(option, activeMsrpCents);
                            return (
                              <button
                                key={option.templateId}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setSheetTemplateId(option.templateId)}
                                className={cn(
                                  "space-y-1 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selected ? "border-primary bg-primary/5" : "border-border",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate text-sm font-medium">{option.name}</span>
                                  {option.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-lg font-semibold tabular-nums">{formatCentsLabel(option.buildCents)}</span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {margin === null ? "No MSRP" : `${Math.round(margin)}% margin`}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Mix {formatCentsLabel(option.fillingCents)} for {option.pieces}{" "}
                                  {option.pieces === 1 ? "piece" : "pieces"}
                                </div>
                                {option.neckSupport === "included" ? (
                                  <div className="text-xs text-muted-foreground">
                                    Accessories inside are included in the price
                                  </div>
                                ) : option.neckSupport === "left_out" ? (
                                  <div className="text-xs text-muted-foreground">Built without the accessories inside it</div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={settingsPath(`/settings/inventory/configure/${activeCard.configureSlug}`)}>
                          Edit filling templates
                        </Link>
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-medium">
                          {activeOption ? `Build with ${activeOption.name}` : "Parts"}
                          {activeFamily.family ? ` in ${PREMIUM_VARIANT_TITLES[activeFamily.family]}` : ""}
                        </h3>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCentsLabel(activeOption?.buildCents ?? activeFamily.costs.baseCents)}
                        </span>
                      </div>
                      {(activeOption?.uncostedItemIds ?? activeFamily.costs.baseUncostedItemIds).length > 0 ? (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                          Some parts have no cost price, so this build costs at least this much.
                        </p>
                      ) : null}
                      <BuildLines
                        title="Parts"
                        subtotalCents={activeFamily.costs.baseCents}
                        groups={activePartGroups}
                        emptyState="No parts configured for this product."
                      />
                      {activeOption ? (
                        <BuildLines
                          title={`Fillings from ${activeOption.name}`}
                          subtotalCents={activeOption.fillingCents}
                          groups={activeFillingGroups}
                          emptyState="This template has no pieces yet."
                        />
                      ) : null}
                    </div>
                  </>
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
  cards: ProductCard[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  renderProductCard: (card: ProductCard) => ReactNode;
};

function ProductGroupSection({
  group,
  cards,
  isOpen,
  onOpenChange,
  renderProductCard,
}: ProductGroupSectionProps) {
  const summaryLabel = `${cards.length} ${group.countLabel ?? "variants"} configured`;
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <div className="overflow-hidden rounded-2xl border bg-background">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors active:bg-press sm:px-4"
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
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {group.emptyState ?? `No ${group.title} products configured yet.`}
            </p>
          ) : (
            <div className="grid grid-cols-1 max-md:divide-y md:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card) => renderProductCard(card))}
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

function PriceInput({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
  ariaLabel,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
        <Input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className="pl-6"
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}

/** One part of a build breakdown: its lines by category, with a subtotal. */
function BuildLines({
  title,
  subtotalCents,
  groups,
  emptyState,
}: {
  title: string;
  subtotalCents: number;
  groups: ProductComponentGroup[];
  emptyState: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm tabular-nums text-muted-foreground">{formatCentsLabel(subtotalCents)}</div>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyState}</p>
      ) : (
        groups.map((group) => (
          <Section key={group.key} title={group.title}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={STICKY_PART_HEAD}>Part</TableHead>
                  <TableHead className="min-w-[3.5rem] sm:w-[70px]">Qty</TableHead>
                  <TableHead className="min-w-[6rem] whitespace-nowrap sm:w-1/5 sm:min-w-0">Cost each</TableHead>
                  <TableHead className="min-w-[6rem] whitespace-nowrap sm:w-1/5 sm:min-w-0">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((detail) => (
                  <TableRow key={detail.item.id}>
                    <TableCell className={STICKY_PART_CELL}>
                      <InventoryItemLabel item={detail.item} groupedByCategory />
                    </TableCell>
                    <TableCell className="tabular-nums">{detail.quantity}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatCentsLabel(detail.costEach)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatCentsLabel(detail.totalCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        ))
      )}
    </div>
  );
}
