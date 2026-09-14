"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import Link from "next/link";
import { notFound, useParams, usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  stickyFirstColumnCellClassName,
  stickyFirstColumnHeadClassName,
} from "@/components/ui/table-sticky";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFillingPreview } from "@/lib/filling-preview";
import { XrayBolsterEditor, XrayEditor } from "@/components/spatial/xray-editor";
import {
  isSpatiallyAuthored,
  isSpatiallyAuthoredCoverage,
  looksLikeLegacyImport,
  unauthoredReason,
} from "@/lib/spatial-fillings/authoring";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import {
  bolsterPlacementsToRows,
  flattenToPackList,
  pillowPlacementsToRows,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";

type FillingTemplateRow = {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
  /** Sections holding at least one Placement; pillow filling templates only. */
  sections?: string[];
};

/** Ranked unpromoted mix (slices 09/13): fingerprint-grouped Result snapshots for this scope.
 * Pillow entries carry cell rows; bolster entries carry slot rows (own schema). */
type UnpromotedEntry = {
  fingerprint: string;
  count: number;
  placements: Array<PillowPlacementRow | BolsterPlacementRow>;
  packList: Array<{ item_id: number; count: number }>;
};

type Item = {
  id: number;
  category:
    | "cover"
    | "pillow_case"
    | "pillow_protector"
    | "bolster_case"
    | "bolster_protector"
    | "filling"
    | "packaging"
    | "accessories"
    | "other";
  subtype: string | null;
  name: string;
  size: string | null;
};

type PillowKind = "basic" | "premium";
type PremiumVariant = "linen" | "fibrecool";

type Product = {
  id: number;
  size: "XS" | "S" | "M" | "L" | "XL";
  kind: PillowKind;
  default_filling_template_id: number | null;
};

type BolsterLength = "short" | "medium" | "long";
const BOLSTER_LENGTHS: BolsterLength[] = ["short", "medium", "long"];

type BomLine = { item_id: number; quantity: number };

type BomState = Record<Product["size"], BomLine[]>;
type BomByKind = Record<PillowKind, BomState>;

const SIZES: Product["size"][] = ["XS", "S", "M", "L", "XL"];
const KNOWN_CATEGORIES: Item["category"][] = [
  "cover",
  "pillow_case",
  "pillow_protector",
  "bolster_case",
  "bolster_protector",
  "filling",
  "packaging",
  "accessories",
  "other",
];

const makeEmptyBom = (): BomState => ({ XS: [], S: [], M: [], L: [], XL: [] });
const makeEmptyBomByKind = (): BomByKind => ({ basic: makeEmptyBom(), premium: makeEmptyBom() });
const makeEmptyDefaultByPillow = (): Record<PillowKind, Record<Product["size"], number | null>> => ({
  basic: { XS: null, S: null, M: null, L: null, XL: null },
  premium: { XS: null, S: null, M: null, L: null, XL: null },
});
const makeEmptyDefaultByBolster = (): Record<BolsterLength, number | null> => ({
  short: null,
  medium: null,
  long: null,
});

const humanizeText = (value: string) =>
  value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeNameOrFallback = (value: string | null | undefined, fallback?: string): string => {
  if (!value) {
    return fallback ? humanizeText(fallback) : "Item";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback ? humanizeText(fallback) : "Item";
  }
  if (/[_-]/.test(trimmed) || trimmed === trimmed.toLowerCase()) {
    return humanizeText(trimmed);
  }
  return trimmed;
};

const getItemBaseName = (item: Item): string => normalizeNameOrFallback(item.name, item.category);

const getFillingDisplayLabel = (item: Item, fallbackSize?: string): string => {
  const variant = normalizeNameOrFallback(item.subtype ?? item.name, "filling");
  const sizeLabel = item.size ?? fallbackSize;
  return sizeLabel ? `${variant} ${sizeLabel}` : variant;
};

/** Desktop: template rail on the left, workbench on the right. Phones stay stacked. */
const WORKBENCH_GRID =
  "lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]";

const matchesTemplateSearch = (t: { name: string; notes: string | null }, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || t.name.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q);
};

// Placements sitting in one Section: the 2026-07-24 backfill, never laid out by a person.
const isUnauthoredTemplate = (t: FillingTemplateRow) =>
  !!t.sections && !isSpatiallyAuthoredCoverage(t.sections);

const sizeEquals = (itemSize: string | null | undefined, expected: string): boolean => {
  if (!itemSize) return false;
  return itemSize.trim().toUpperCase() === expected.trim().toUpperCase();
};

type DbItem = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
};

const normalizeDbItemCategory = (row: DbItem): Item["category"] | null => {
  const rawCategory = row.category?.trim().toLowerCase();
  const rawSize = row.size?.trim();
  const upperSize = rawSize ? rawSize.toUpperCase() : null;

  // Back-compat: older rows used `case` / `protector` and relied on size to differentiate.
  if (rawCategory === "case") {
    return upperSize === "BOLSTER" ? "bolster_case" : "pillow_case";
  }
  if (rawCategory === "protector") {
    return upperSize === "BOLSTER" ? "bolster_protector" : "pillow_protector";
  }

  // Current categories (already split).
  if (KNOWN_CATEGORIES.includes(rawCategory as Item["category"])) {
    return rawCategory as Item["category"];
  }

  return null;
};

const normalizeDbItems = (rows: DbItem[]): Item[] =>
  rows
    .map((row) => {
      const category = normalizeDbItemCategory(row);
      if (!category) return null;
      return {
        id: Number(row.id),
        category,
        subtype: row.subtype ?? null,
        name: row.name ?? "",
        size: row.size ?? null,
      } satisfies Item;
    })
    .filter((row): row is Item => !!row);

export default function ConfigureCardPage() {
  // Card identity lives in the URL: `basic-M` / `premium-XL` (pillow kind-size)
  // or `bolster-short|medium|long` (bolster length).
  const params = useParams<{ card: string }>();
  const [kindPart, keyPart] = (params.card ?? "").split("-");
  const selectedPillowKind: PillowKind | null =
    kindPart === "basic" || kindPart === "premium" ? kindPart : null;
  const selectedSize: Product["size"] | null =
    selectedPillowKind && (SIZES as string[]).includes(keyPart ?? "")
      ? (keyPart as Product["size"])
      : null;
  const bolsterVariant =
    kindPart === "bolster"
      ? keyPart === "short"
        ? ("Short (0.8m)" as const)
        : keyPart === "medium"
          ? ("Medium (1m)" as const)
          : keyPart === "long"
            ? ("Long (1.2m)" as const)
            : null
      : null;
  if (!(selectedPillowKind && selectedSize) && !bolsterVariant) notFound();
  const open = !!(selectedPillowKind && selectedSize);
  const bolsterOpen = !!bolsterVariant;
  const productLabel = selectedPillowKind
    ? selectedPillowKind === "premium"
      ? "Premium Mpillow"
      : "Basic Mpillow"
    : "Mbolster";
  const sizeLabel = selectedSize ? `Size ${selectedSize}` : bolsterVariant ?? "";

  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const settingsPath = useCallback((path: string) => withLocale(path, locale), [locale]);
  useSettingsBreadcrumbDetail(`${productLabel} · ${sizeLabel}`);

  const loadTemplates = useCallback(async (kind: 'pillow' | 'bolster', key: string, pillowKind?: PillowKind, pillowVariant?: PremiumVariant) => {
    const pillowKindParam = kind === 'pillow' && pillowKind ? `&pillowKind=${encodeURIComponent(pillowKind)}` : ''
    const pillowVariantParam =
      kind === 'pillow' && pillowKind === 'premium' && pillowVariant
        ? `&pillowVariant=${encodeURIComponent(pillowVariant)}`
        : '';
    const url = settingsPath(`/settings/inventory/configure/templates?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}&role=warehouse${pillowKindParam}${pillowVariantParam}`)
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      const message = payload?.error ?? 'Failed to load templates'
      throw new Error(typeof message === 'string' ? message : 'Failed to load templates')
    }
    const payload = await res.json().catch(() => null)
    return (payload?.templates ?? []) as Array<{ id: number; name: string; notes: string | null }>
  }, [settingsPath]);

  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bomByKind, setBomByKind] = useState<BomByKind>(() => makeEmptyBomByKind());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [bolsterLines, setBolsterLines] = useState<BomLine[]>([]);
  const [pillowTemplates, setPillowTemplates] = useState<Array<{ id: number; name: string; notes: string | null }>>([]);
  const [pillowSelectedTemplateId, setPillowSelectedTemplateId] = useState<number | ''>('');
  const [pillowTemplateName, setPillowTemplateName] = useState('');
  const [pillowTemplateNotes, setPillowTemplateNotes] = useState('');
  const [premiumVariant, setPremiumVariant] = useState<PremiumVariant>('linen');
  const [bolsterTemplates, setBolsterTemplates] = useState<Array<{ id: number; name: string; notes: string | null }>>([]);
  const [bolsterSelectedTemplateId, setBolsterSelectedTemplateId] = useState<number | ''>('');
  const [bolsterTemplateName, setBolsterTemplateName] = useState('');
  const [bolsterTemplateNotes, setBolsterTemplateNotes] = useState('');
  const [pillowDeleteOpen, setPillowDeleteOpen] = useState(false);
  const [bolsterDeleteOpen, setBolsterDeleteOpen] = useState(false);
  const [pillowDrawerTab, setPillowDrawerTab] = useState<"product" | "filling">("product");
  const [bolsterDrawerTab, setBolsterDrawerTab] = useState<"product" | "filling">("product");
  const [defaultFillingByPillow, setDefaultFillingByPillow] = useState(makeEmptyDefaultByPillow);
  const [defaultFillingByBolster, setDefaultFillingByBolster] = useState(makeEmptyDefaultByBolster);

  const getBolsterTemplateKey = useCallback((variant: NonNullable<typeof bolsterVariant>) => {
    return variant === 'Short (0.8m)' ? 'short' : variant === 'Long (1.2m)' ? 'long' : 'medium';
  }, []);

  const pillowSelectedTemplate = useMemo(() => {
    if (pillowSelectedTemplateId === '') return null;
    return pillowTemplates.find((t) => t.id === pillowSelectedTemplateId) ?? null;
  }, [pillowTemplates, pillowSelectedTemplateId]);

  const bolsterSelectedTemplate = useMemo(() => {
    if (bolsterSelectedTemplateId === '') return null;
    return bolsterTemplates.find((t) => t.id === bolsterSelectedTemplateId) ?? null;
  }, [bolsterTemplates, bolsterSelectedTemplateId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: itemsData }, { data: productsData }, { data: bomData }, { data: bolsterConfig }] = await Promise.all([
      supabaseClient.from("items").select("id,category,subtype,name,size").eq("is_active", true),
      supabaseClient.from("pillow_products").select("id,size,kind,default_filling_template_id").eq("is_active", true),
      supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
      supabaseClient.from("bolster_length_config").select("variant,default_filling_template_id"),
    ]);
    setItems(normalizeDbItems((itemsData ?? []) as DbItem[]));
    const prods = (productsData ?? []) as Product[];
    setProducts(prods);
    const nextDefaults = makeEmptyDefaultByPillow();
    for (const p of prods) {
      if (p.kind === "basic" || p.kind === "premium") {
        nextDefaults[p.kind][p.size] =
          p.default_filling_template_id != null ? Number(p.default_filling_template_id) : null;
      }
    }
    setDefaultFillingByPillow(nextDefaults);
    const nextBolsterDefaults = makeEmptyDefaultByBolster();
    for (const row of bolsterConfig ?? []) {
      const variant = String(row.variant) as BolsterLength;
      if (variant in nextBolsterDefaults) {
        nextBolsterDefaults[variant] =
          row.default_filling_template_id != null ? Number(row.default_filling_template_id) : null;
      }
    }
    setDefaultFillingByBolster(nextBolsterDefaults);
    const next: BomByKind = makeEmptyBomByKind();
    type BomRow = { product_id: number; item_id: number; quantity: number | string };
    // Index products once, and track each (kind,size) list's item positions, so
    // the per-row product lookup and de-dupe are hash lookups rather than scans.
    const productById = new Map<number, Product>();
    for (const p of prods) {
      if (!productById.has(p.id)) productById.set(p.id, p);
    }
    const lineIndexByKindSize = new Map<string, Map<number, number>>();
    (bomData ?? []).forEach((row: BomRow) => {
      const product = productById.get(row.product_id);
      if (!product) return;
      const kind = product.kind as PillowKind;
      const size = product.size as Product["size"];
      if (kind !== "basic" && kind !== "premium") return;
      // Defensive de-dupe: never allow the same item_id twice for one (kind,size).
      const itemId = Number(row.item_id);
      const quantity = Number(row.quantity);
      const listKey = `${kind}:${size}`;
      let indexByItemId = lineIndexByKindSize.get(listKey);
      if (!indexByItemId) {
        indexByItemId = new Map<number, number>();
        lineIndexByKindSize.set(listKey, indexByItemId);
      }
      const lines = next[kind][size];
      const existingIdx = indexByItemId.get(itemId);
      if (existingIdx === undefined) {
        indexByItemId.set(itemId, lines.length);
        lines.push({ item_id: itemId, quantity });
      } else {
        lines[existingIdx] = { item_id: itemId, quantity };
      }
    });
    setBomByKind(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial load + keep data fresh if inventory changes in another tab/page.
    loadAll();
    const onChanged = () => {
      loadAll();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("inventory:changed", onChanged);
      let bc: BroadcastChannel | null = null;
      try {
        if ("BroadcastChannel" in window) {
          bc = new BroadcastChannel("inventory:changed");
          bc.onmessage = () => onChanged();
        }
      } catch {}
      return () => {
        window.removeEventListener("inventory:changed", onChanged);
        try {
          bc?.close();
        } catch {}
      };
    }
    return;
  }, [loadAll]);

  useEffect(() => {
    const loadVariant = async () => {
      if (!bolsterOpen || !bolsterVariant) return;
      const variant = bolsterVariant === 'Short (0.8m)'
        ? 'short' : bolsterVariant === 'Long (1.2m)'
        ? 'long' : 'medium';
      type LineRow = { item_id: number; quantity: number | string };
      const { data } = await supabaseClient
        .from('bolster_bom_lines')
        .select('item_id,quantity')
        .eq('variant', variant);
      const rows = (data ?? []).map((l: LineRow) => ({ item_id: l.item_id, quantity: Number(l.quantity) }));
      setBolsterLines(rows);
    };
    loadVariant();
  }, [bolsterOpen, bolsterVariant]);

  useEffect(() => {
    const load = async () => {
      if (!open || !selectedSize || !selectedPillowKind) return;
      try {
        const list = await loadTemplates(
          'pillow',
          selectedSize,
          selectedPillowKind,
          selectedPillowKind === 'premium' ? premiumVariant : undefined,
        );
        setPillowTemplates(list);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load templates');
      }
    };
    load();
  }, [open, selectedSize, selectedPillowKind, premiumVariant, loadTemplates]);

  useEffect(() => {
    const load = async () => {
      if (!bolsterOpen || !bolsterVariant) return;
      const key = getBolsterTemplateKey(bolsterVariant);
      try {
        const list = await loadTemplates('bolster', key);
        setBolsterTemplates(list);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load templates');
      }
    };
    load();
  }, [bolsterOpen, bolsterVariant, getBolsterTemplateKey, loadTemplates]);

  // removed unused itemsBy

  const buildPayloadLines = (lines: BomLine[]) =>
    lines
      .map((line) => {
        const quantity = Number.isFinite(line.quantity) ? Math.max(0, Math.round(line.quantity)) : 0;
        return { item_id: line.item_id, quantity };
      })
      .filter((line) => line.quantity > 0);

  const notifyInventoryChange = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('inventory:changed'));
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('inventory:changed');
        channel.postMessage('refresh');
        channel.close();
      }
    } catch {
      // ignore
    }
  };

  const persistProductBom = async (
    productId: number,
    lines: BomLine[],
    defaultFillingTemplateId?: number | null,
  ) => {
    const payloadLines = buildPayloadLines(lines);
    const body: {
      productId: number;
      lines: { item_id: number; quantity: number }[];
      defaultFillingTemplateId?: number | null;
    } = { productId, lines: payloadLines };
    if (defaultFillingTemplateId !== undefined) {
      body.defaultFillingTemplateId = defaultFillingTemplateId;
    }
    const response = await fetch(settingsPath("/settings/inventory/configure/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error ?? "Failed to save configuration";
      throw new Error(message);
    }
  };

  const [cardColorOverrides, setCardColorOverrides] = useState<ColorOverrideRow[]>([]);

  const loadFillingTemplates = useCallback(async (kind: "pillow" | "bolster", key: string) => {
    const url = settingsPath(
      `/settings/inventory/configure/templates?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}&role=filling`,
    );
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error ?? "Failed to load Filling Templates");
    }
    const payload = await res.json().catch(() => null);
    const rows = (payload?.templates ?? []) as FillingTemplateRow[];
    // Global per-subtype x-ray colours: lifted to the card so the editor has them
    // before any template is opened (a new template would otherwise render on code
    // defaults while the configurator shows Product Builder colours).
    if (payload?.colorOverrides) {
      setCardColorOverrides(payload.colorOverrides as ColorOverrideRow[]);
    }
    // Fold Section coverage onto each row so the eight call sites keep the same
    // shape and only the badge has to know about it.
    const coverage = payload?.sectionCoverage as Record<number, string[]> | undefined;
    return coverage ? rows.map((t) => ({ ...t, sections: coverage[t.id] ?? [] })) : rows;
  }, [settingsPath]);

  const loadTemplateLines = async (templateId: number) => {
    const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${templateId}`), { method: 'GET' })
    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      const message = payload?.error ?? 'Failed to load template'
      throw new Error(typeof message === 'string' ? message : 'Failed to load template')
    }
    type LineRow = { item_id: number | string; quantity: number | string }
    return ((payload?.lines ?? []) as LineRow[]).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) }))
  }

  const deleteTemplateById = async (templateId: number) => {
    const res = await fetch(settingsPath("/settings/inventory/configure/templates"), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error ?? 'Failed to delete template');
  };

  const confirmDeletePillowTemplate = async () => {
    if (pillowSelectedTemplateId === '') return;
    if (!selectedSize || !selectedPillowKind) {
      toast.error('Select a pillow size/kind first');
      return;
    }
    setDeletingTemplate(true);
    try {
      await deleteTemplateById(pillowSelectedTemplateId);
      const list = await loadTemplates(
        'pillow',
        selectedSize,
        selectedPillowKind,
        selectedPillowKind === 'premium' ? premiumVariant : undefined,
      );
      setPillowTemplates(list);
      setPillowSelectedTemplateId('');
      setPillowDeleteOpen(false);
      toast.success('Template deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeletingTemplate(false);
    }
  };

  const confirmDeleteBolsterTemplate = async () => {
    if (bolsterSelectedTemplateId === '') return;
    if (!bolsterVariant) {
      toast.error('Select a bolster variant first');
      return;
    }
    setDeletingTemplate(true);
    try {
      await deleteTemplateById(bolsterSelectedTemplateId);
      const key = getBolsterTemplateKey(bolsterVariant);
      const list = await loadTemplates('bolster', key);
      setBolsterTemplates(list);
      setBolsterSelectedTemplateId('');
      setBolsterDeleteOpen(false);
      toast.success('Template deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeletingTemplate(false);
    }
  };

  const saveBolster = async () => {
    if (!bolsterVariant) {
      toast.message("Select a bolster variant to save");
      return;
    }
    setSaving(true);
    try {
      const bolsterKey = getBolsterTemplateKey(bolsterVariant);
      const lines = buildPayloadLines(bolsterLines ?? []);
      const defaultFillingTemplateId = defaultFillingByBolster[bolsterKey];
      const response = await fetch(settingsPath("/settings/inventory/configure/save"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'bolster',
          variant: bolsterKey,
          lines,
          defaultFillingTemplateId,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? 'Failed to save bolster';
        throw new Error(message);
      }
      // If a bolster template is selected, keep it in sync with the edited lines.
      if (bolsterSelectedTemplateId !== '') {
        const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${bolsterSelectedTemplateId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: bolsterTemplateNotes.trim() || undefined,
            lines,
          }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => null)
          throw new Error(payload?.error ?? 'Failed to update template')
        }
      }
      toast.success('Bolster configuration saved');
      notifyInventoryChange();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save bolster';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveSelected = async (kind: PillowKind, size: Product["size"]) => {
    setSaving(true);
    try {
      const product = products.find((p) => p.size === size && p.kind === kind);
      if (!product) {
        throw new Error(`No active ${kind} pillow product found for size ${size}`);
      }
      // If the user is editing a saved template, persist the edits back into that template too.
      // This matches the UX expectation that reloading the template reflects what was just saved.
      if (pillowSelectedTemplateId !== '') {
        const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${pillowSelectedTemplateId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: pillowTemplateNotes.trim() || undefined,
            lines: buildPayloadLines(bomByKind[kind][size] ?? []),
          }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => null)
          throw new Error(payload?.error ?? 'Failed to update template')
        }
      }
      await persistProductBom(
        product.id,
        bomByKind[kind][size] ?? [],
        defaultFillingByPillow[kind][size],
      );
      toast.success(`${kind === 'basic' ? 'Basic' : 'Premium'} configuration saved for size ${size}`);
      notifyInventoryChange();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Shared by the phone Select and the desktop rail: loading a template replaces the editor lines.
  const selectPillowTemplate = async (next: number | '') => {
    setPillowSelectedTemplateId(next);
    if (next === '' || !selectedPillowKind || !selectedSize) return;
    try {
      const lines = await loadTemplateLines(next);
      setBomByKind((prev) => ({
        ...prev,
        [selectedPillowKind]: { ...prev[selectedPillowKind], [selectedSize]: lines },
      }));
      toast.success('Template loaded into editor');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load template');
    }
  };

  const selectBolsterTemplate = async (next: number | '') => {
    setBolsterSelectedTemplateId(next);
    if (next === '') return;
    try {
      setBolsterLines(await loadTemplateLines(next));
      toast.success('Template loaded into editor');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load template');
    }
  };

  const changePremiumVariant = (value: string) => {
    if (value === 'linen' || value === 'fibrecool') {
      setPremiumVariant(value);
      setPillowSelectedTemplateId('');
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={settingsPath("/settings/inventory/configure")}>Configure</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{productLabel}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{sizeLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="space-y-1">
        <h1>Configure {productLabel} — {sizeLabel}</h1>
        <p className="text-sm text-muted-foreground">
          Product tab: non-filling BOM and warehouse presets. Filling Config: filling mixes for this {open ? "size" : "length"}.
        </p>
      </div>
      <Separator />
      {selectedSize && selectedPillowKind && (
        <>
            <Tabs
              value={pillowDrawerTab}
              onValueChange={(v) => setPillowDrawerTab(v as "product" | "filling")}
              className="mt-2"
            >
              <TabsList className="w-full lg:w-auto">
                <TabsTrigger value="product" className="flex-1 lg:px-6">Product</TabsTrigger>
                <TabsTrigger value="filling" className="flex-1 lg:px-6">Filling Config</TabsTrigger>
              </TabsList>
              <TabsContent value="product" className="mt-4 overflow-y-auto lg:overflow-visible">
              <div className={WORKBENCH_GRID}>
              <WarehouseTemplateRail
                templates={pillowTemplates}
                selectedId={pillowSelectedTemplateId}
                onSelect={(id) => void selectPillowTemplate(id)}
                scopeFilter={
                  selectedPillowKind === 'premium' ? (
                    <Select value={premiumVariant} onValueChange={changePremiumVariant}>
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Variant" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linen">Linen</SelectItem>
                        <SelectItem value="fibrecool">Fibrecool</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : undefined
                }
              />
              <div className="min-w-0 space-y-3">
              <WorkbenchHeader
                title={pillowSelectedTemplate?.name ?? `${productLabel} — ${sizeLabel}`}
                description={
                  pillowSelectedTemplate
                    ? 'Linked template — saving updates the product BOM and this template.'
                    : 'No template linked — pick one to load its parts, or save these parts as a new template.'
                }
                actions={
                  <>
                    {pillowSelectedTemplate && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setPillowSelectedTemplateId('')}>
                          Unlink
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingTemplate}
                          onClick={() => setPillowDeleteOpen(true)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </>
                    )}
                    <Button size="sm" onClick={() => saveSelected(selectedPillowKind, selectedSize)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                  </>
                }
              />
              <div className="space-y-3 lg:rounded-xl lg:border lg:p-4">
              {selectedPillowKind === 'premium' && (
                <div className="space-y-1 lg:hidden">
                  <div className="text-sm font-medium text-muted-foreground">Premium variant</div>
                  <Select value={premiumVariant} onValueChange={changePremiumVariant}>
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
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-1 lg:hidden">
                  <div className="text-sm font-medium text-muted-foreground">Template</div>
                  <Select
                    value={pillowSelectedTemplateId === '' ? '' : String(pillowSelectedTemplateId)}
                    onValueChange={(value) => void selectPillowTemplate(value ? Number(value) : '')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select template…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select template…</SelectItem>
                      {pillowTemplates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Save as template</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Template name"
                      value={pillowTemplateName}
                      onChange={(e) => setPillowTemplateName(e.target.value)}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="lg:hidden"
                      disabled={pillowSelectedTemplateId === '' || deletingTemplate}
                      onClick={() => setPillowDeleteOpen(true)}
                      title={pillowSelectedTemplateId === '' ? 'Select a template to delete' : 'Delete selected template'}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete template</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const name = pillowTemplateName.trim();
                        if (!name) { toast.message('Enter a template name'); return; }
                        try {
                          const res = await fetch(settingsPath("/settings/inventory/configure/templates"), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              kind: 'pillow',
                              key: selectedSize,
                              pillowKind: selectedPillowKind,
                              pillowVariant: selectedPillowKind === 'premium' ? premiumVariant : undefined,
                              name,
                              notes: pillowTemplateNotes.trim() || undefined,
                              role: 'warehouse',
                              lines: buildPayloadLines(bomByKind[selectedPillowKind][selectedSize] ?? []),
                            }),
                          });
                          const payload = await res.json().catch(() => null);
                          if (!res.ok) throw new Error(payload?.error ?? 'Failed to save template');
                          const list = await loadTemplates(
                            'pillow',
                            selectedSize,
                            selectedPillowKind,
                            selectedPillowKind === 'premium' ? premiumVariant : undefined,
                          );
                          setPillowTemplates(list);
                          setPillowTemplateName('');
                          setPillowTemplateNotes('');
                          toast.success(payload?.updatedExisting ? 'Template updated' : 'Template saved');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Failed to save template');
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
              <Input
                placeholder="Template notes (optional)"
                value={pillowTemplateNotes}
                onChange={(e) => setPillowTemplateNotes(e.target.value)}
              />
              </div>
              <Dialog open={pillowDeleteOpen} onOpenChange={setPillowDeleteOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete template?</DialogTitle>
                    <DialogDescription>
                      {pillowSelectedTemplate
                        ? <>This will permanently delete <strong>{pillowSelectedTemplate.name}</strong>. This can’t be undone.</>
                        : <>This will permanently delete the selected template. This can’t be undone.</>}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="secondary" onClick={() => setPillowDeleteOpen(false)} disabled={deletingTemplate}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={confirmDeletePillowTemplate}
                      disabled={pillowSelectedTemplateId === '' || deletingTemplate}
                    >
                      {deletingTemplate ? 'Deleting…' : 'Delete'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Separator className="lg:hidden" />
              <DefaultFillingPicker
                kind="pillow"
                templateKey={selectedSize}
                items={items}
                selectedId={defaultFillingByPillow[selectedPillowKind][selectedSize]}
                onSelectedIdChange={(next) => {
                  setDefaultFillingByPillow((prev) => ({
                    ...prev,
                    [selectedPillowKind]: { ...prev[selectedPillowKind], [selectedSize]: next },
                  }));
                }}
                loadFillingTemplates={loadFillingTemplates}
                loadTemplateLines={loadTemplateLines}
              />
              <Separator className="lg:hidden" />
              <SizeEditor
                size={selectedSize}
                items={items}
                bom={bomByKind[selectedPillowKind]}
                setBom={(next) => {
                  setBomByKind((prev) => ({
                    ...prev,
                    [selectedPillowKind]: typeof next === 'function' ? (next as (p: BomState) => BomState)(prev[selectedPillowKind]) : next,
                  }))
                }}
              />
              </div>
              </div>
              </TabsContent>
              <TabsContent value="filling" className="mt-4 overflow-y-auto">
                <FillingConfigPanel
                  kind="pillow"
                  templateKey={selectedSize}
                  items={items}
                  settingsPath={settingsPath}
                  loadFillingTemplates={loadFillingTemplates}
                  deleteTemplateById={deleteTemplateById}
                  colorOverrides={cardColorOverrides}
                />
              </TabsContent>
            </Tabs>
          {pillowDrawerTab === "product" && (
            <div className="flex justify-end lg:hidden">
              <Button
                onClick={() => {
                  if (!selectedPillowKind || !selectedSize) return;
                  saveSelected(selectedPillowKind, selectedSize);
                }}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}
        </>
      )}
      {bolsterVariant && (
        <>
            <Tabs
              value={bolsterDrawerTab}
              onValueChange={(v) => setBolsterDrawerTab(v as "product" | "filling")}
              className="mt-2"
            >
              <TabsList className="w-full lg:w-auto">
                <TabsTrigger value="product" className="flex-1 lg:px-6">Product</TabsTrigger>
                <TabsTrigger value="filling" className="flex-1 lg:px-6">Filling Config</TabsTrigger>
              </TabsList>
              <TabsContent value="product" className="mt-4 overflow-y-auto lg:overflow-visible">
              <div className={WORKBENCH_GRID}>
              <WarehouseTemplateRail
                templates={bolsterTemplates}
                selectedId={bolsterSelectedTemplateId}
                onSelect={(id) => void selectBolsterTemplate(id)}
              />
              <div className="min-w-0 space-y-3">
              <WorkbenchHeader
                title={bolsterSelectedTemplate?.name ?? `${productLabel} — ${sizeLabel}`}
                description={
                  bolsterSelectedTemplate
                    ? 'Linked template — saving updates the bolster BOM and this template.'
                    : 'No template linked — pick one to load its parts, or save these parts as a new template.'
                }
                actions={
                  <>
                    {bolsterSelectedTemplate && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setBolsterSelectedTemplateId('')}>
                          Unlink
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingTemplate}
                          onClick={() => setBolsterDeleteOpen(true)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </>
                    )}
                    <Button size="sm" onClick={saveBolster} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                }
              />
              <div className="space-y-3 lg:rounded-xl lg:border lg:p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-1 lg:hidden">
                  <div className="text-sm font-medium text-muted-foreground">Template</div>
                  <Select
                    value={bolsterSelectedTemplateId === '' ? '' : String(bolsterSelectedTemplateId)}
                    onValueChange={(value) => void selectBolsterTemplate(value ? Number(value) : '')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select template…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select template…</SelectItem>
                      {bolsterTemplates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Save as template</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Template name"
                      value={bolsterTemplateName}
                      onChange={(e) => setBolsterTemplateName(e.target.value)}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="lg:hidden"
                      disabled={bolsterSelectedTemplateId === '' || deletingTemplate}
                      onClick={() => setBolsterDeleteOpen(true)}
                      title={bolsterSelectedTemplateId === '' ? 'Select a template to delete' : 'Delete selected template'}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete template</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const name = bolsterTemplateName.trim();
                        if (!name) { toast.message('Enter a template name'); return; }
                        const key = getBolsterTemplateKey(bolsterVariant);
                        try {
                          const res = await fetch(settingsPath("/settings/inventory/configure/templates"), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              kind: 'bolster',
                              key,
                              name,
                              notes: bolsterTemplateNotes.trim() || undefined,
                              role: 'warehouse',
                              lines: buildPayloadLines(bolsterLines ?? []),
                            }),
                          });
                          const payload = await res.json().catch(() => null);
                          if (!res.ok) throw new Error(payload?.error ?? 'Failed to save template');
                          const list = await loadTemplates('bolster', key);
                          setBolsterTemplates(list);
                          setBolsterTemplateName('');
                          setBolsterTemplateNotes('');
                          toast.success(payload?.updatedExisting ? 'Template updated' : 'Template saved');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Failed to save template');
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
              <Input
                placeholder="Template notes (optional)"
                value={bolsterTemplateNotes}
                onChange={(e) => setBolsterTemplateNotes(e.target.value)}
              />
              </div>
              <Dialog open={bolsterDeleteOpen} onOpenChange={setBolsterDeleteOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete template?</DialogTitle>
                    <DialogDescription>
                      {bolsterSelectedTemplate
                        ? <>This will permanently delete <strong>{bolsterSelectedTemplate.name}</strong>. This can’t be undone.</>
                        : <>This will permanently delete the selected template. This can’t be undone.</>}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="secondary" onClick={() => setBolsterDeleteOpen(false)} disabled={deletingTemplate}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={confirmDeleteBolsterTemplate}
                      disabled={bolsterSelectedTemplateId === '' || deletingTemplate}
                    >
                      {deletingTemplate ? 'Deleting…' : 'Delete'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Separator className="lg:hidden" />
              <DefaultFillingPicker
                kind="bolster"
                templateKey={getBolsterTemplateKey(bolsterVariant)}
                items={items}
                selectedId={defaultFillingByBolster[getBolsterTemplateKey(bolsterVariant)]}
                onSelectedIdChange={(next) => {
                  const key = getBolsterTemplateKey(bolsterVariant);
                  setDefaultFillingByBolster((prev) => ({ ...prev, [key]: next }));
                }}
                loadFillingTemplates={loadFillingTemplates}
                loadTemplateLines={loadTemplateLines}
              />
              <Separator className="lg:hidden" />
              <BolsterEditor
                items={items}
                lines={bolsterLines}
                setLines={setBolsterLines}
                variant={bolsterVariant}
              />
              </div>
              </div>
              </TabsContent>
              <TabsContent value="filling" className="mt-4 overflow-y-auto">
                <FillingConfigPanel
                  kind="bolster"
                  templateKey={getBolsterTemplateKey(bolsterVariant)}
                  items={items}
                  settingsPath={settingsPath}
                  loadFillingTemplates={loadFillingTemplates}
                  deleteTemplateById={deleteTemplateById}
                  colorOverrides={cardColorOverrides}
                />
              </TabsContent>
            </Tabs>
          {bolsterDrawerTab === "product" && (
            <div className="flex justify-end lg:hidden">
              <Button onClick={saveBolster} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DefaultFillingPicker({
  kind,
  templateKey,
  items,
  selectedId,
  onSelectedIdChange,
  loadFillingTemplates,
  loadTemplateLines,
}: {
  kind: "pillow" | "bolster";
  templateKey: string;
  items: Item[];
  selectedId: number | null;
  onSelectedIdChange: (id: number | null) => void;
  loadFillingTemplates: (kind: "pillow" | "bolster", key: string) => Promise<FillingTemplateRow[]>;
  loadTemplateLines: (templateId: number) => Promise<BomLine[]>;
}) {
  const [templates, setTemplates] = useState<FillingTemplateRow[]>([]);
  const [preview, setPreview] = useState<Array<{ variant: string; qty: number }>>([]);
  const [loading, setLoading] = useState(false);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, { name: i.name, subtype: i.subtype, size: i.size }])),
    [items],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadFillingTemplates(kind, templateKey);
        if (!cancelled) setTemplates(list.filter((t) => t.is_active));
      } catch {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, templateKey, loadFillingTemplates]);

  useEffect(() => {
    let cancelled = false;
    if (selectedId == null) {
      setPreview([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const lines = await loadTemplateLines(selectedId);
        if (!cancelled) {
          setPreview(formatFillingPreview(lines, itemsById, templateKey));
        }
      } catch {
        if (!cancelled) setPreview([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadTemplateLines, itemsById, templateKey]);

  return (
    <div className="space-y-2 lg:rounded-xl lg:border lg:p-4">
      <div className="text-sm font-medium text-muted-foreground lg:text-foreground">Default Filling Template</div>
      <Select
        value={selectedId == null ? "" : String(selectedId)}
        onValueChange={(value) => onSelectedIdChange(value ? Number(value) : null)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="No default configured" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">No default configured</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedId == null ? (
        <p className="text-xs text-muted-foreground">No default configured</p>
      ) : loading ? (
        <p className="text-xs text-muted-foreground">Loading preview…</p>
      ) : preview.length ? (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {preview.map((line, idx) => (
            <li key={idx}>
              {line.variant} ×{line.qty}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Default has no filling lines</p>
      )}
    </div>
  );
}

function FillingConfigPanel({
  kind,
  templateKey,
  items,
  settingsPath,
  loadFillingTemplates,
  deleteTemplateById,
  colorOverrides,
}: {
  kind: "pillow" | "bolster";
  templateKey: string;
  items: Item[];
  settingsPath: (path: string) => string;
  loadFillingTemplates: (kind: "pillow" | "bolster", key: string) => Promise<FillingTemplateRow[]>;
  deleteTemplateById: (templateId: number) => Promise<void>;
  /** Global per-subtype x-ray colours, owned by the card (not per-template). */
  colorOverrides: ColorOverrideRow[];
}) {
  const [templates, setTemplates] = useState<FillingTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [lines, setLines] = useState<BomLine[]>([]);
  // Spatial recipe: placements are the "where" truth; lines stay for the legacy notice.
  // Pillow = 3×3 cells; bolster = single compartment slot list (own schema, no cap).
  const [placements, setPlacements] = useState<PillowPlacement[]>([]);
  const [bolsterMix, setBolsterMix] = useState<BolsterPlacement[]>([]);
  const [hadPlacements, setHadPlacements] = useState(false);
  const [saving, setSaving] = useState(false);
  // Unpromoted ranking + Promote (slices 09/13): Admin Panel only.
  const [unpromoted, setUnpromoted] = useState<UnpromotedEntry[]>([]);
  const [promoteTarget, setPromoteTarget] = useState<UnpromotedEntry | null>(null);
  const [promoteName, setPromoteName] = useState("");
  const [promoting, setPromoting] = useState(false);
  // Desktop rail filters (Products toolbar idiom).
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [authoringFilter, setAuthoringFilter] = useState<"all" | "authored" | "unauthored">("all");

  const resetEditor = useCallback(() => {
    setSelectedId("");
    setName("");
    setNotes("");
    setActive(true);
    setLines([]);
    setPlacements([]);
    setBolsterMix([]);
    setHadPlacements(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    resetEditor();
    (async () => {
      try {
        const list = await loadFillingTemplates(kind, templateKey);
        if (!cancelled) setTemplates(list);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load Filling Templates");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, templateKey, loadFillingTemplates, resetEditor]);

  const fetchUnpromoted = useCallback(async (): Promise<UnpromotedEntry[]> => {
    const res = await fetch(
      settingsPath(
        `/settings/inventory/configure/unpromoted?kind=${kind}&key=${encodeURIComponent(templateKey)}`,
      ),
      { method: "GET" },
    );
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error ?? "Failed to load unpromoted mixes");
    return (payload?.entries ?? []) as UnpromotedEntry[];
  }, [kind, templateKey, settingsPath]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await fetchUnpromoted();
        if (!cancelled) setUnpromoted(entries);
      } catch (e) {
        if (!cancelled) {
          setUnpromoted([]);
          toast.error(e instanceof Error ? e.message : "Failed to load unpromoted mixes");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUnpromoted]);

  const promoteMix = async () => {
    if (!promoteTarget) return;
    const trimmed = promoteName.trim();
    if (!trimmed) {
      toast.message("Enter a template name");
      return;
    }
    setPromoting(true);
    try {
      const res = await fetch(settingsPath("/settings/inventory/configure/unpromoted"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          key: templateKey,
          fingerprint: promoteTarget.fingerprint,
          name: trimmed,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to promote");
      setPromoteTarget(null);
      setPromoteName("");
      // Promoted mixes match a template now: refresh both the picker and the ranking.
      setTemplates(await loadFillingTemplates(kind, templateKey));
      setUnpromoted(await fetchUnpromoted());
      toast.success("Promoted to Filling Template");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to promote");
    } finally {
      setPromoting(false);
    }
  };

  const selectTemplate = async (id: number | "") => {
    setSelectedId(id);
    if (id === "") {
      setName("");
      setNotes("");
      setActive(true);
      setLines([]);
      setPlacements([]);
      setBolsterMix([]);
      setHadPlacements(false);
      return;
    }
    const meta = templates.find((t) => t.id === id);
    setName(meta?.name ?? "");
    setNotes(meta?.notes ?? "");
    setActive(meta?.is_active ?? true);
    try {
      const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${id}`), { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.error ?? "Failed to load template";
        throw new Error(typeof message === "string" ? message : "Failed to load template");
      }
      type LineRow = { item_id: number | string; quantity: number | string };
      setLines(((payload?.lines ?? []) as LineRow[]).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) })));
      // Per-kind spatial rows: bolster rows are slot-only (never pillow enums).
      if (kind === "pillow") {
        const placementRows = (payload?.placements ?? []) as PillowPlacementRow[];
        setPlacements(rowsToPillowPlacements(placementRows));
        setHadPlacements(placementRows.length > 0);
      } else {
        const placementRows = (payload?.placements ?? []) as BolsterPlacementRow[];
        setBolsterMix(rowsToBolsterPlacements(placementRows));
        setHadPlacements(placementRows.length > 0);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load template lines");
    }
  };

  // Per-kind spatial payload; the PUT route validates and stores per schema.
  const spatialRows = () =>
    kind === "pillow" ? pillowPlacementsToRows(placements) : bolsterPlacementsToRows(bolsterMix);
  const spatialCount = kind === "pillow" ? placements.length : bolsterMix.length;

  const putTemplatePlacements = async (templateId: number) => {
    const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${templateId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: notes.trim() || undefined,
        is_active: active,
        placements: spatialRows(),
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error ?? "Failed to save placements");
  };

  const saveTemplate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.message("Enter a Filling Template name");
      return;
    }
    setSaving(true);
    try {
      // Spatial save of an existing template: PUT placements only — legacy
      // flat lines stay untouched server-side as the pre-spatial record (ADR 0008).
      const existing = templates.find((t) => t.name === trimmed);
      if (existing) {
        await putTemplatePlacements(existing.id);
        setTemplates(await loadFillingTemplates(kind, templateKey));
        setSelectedId(existing.id);
        setHadPlacements(true);
        toast.success("Filling Template updated");
        return;
      }
      const res = await fetch(settingsPath("/settings/inventory/configure/templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          key: templateKey,
          name: trimmed,
          notes: notes.trim() || undefined,
          role: "filling",
          is_active: active,
          lines: [],
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save Filling Template");
      const savedId = payload?.template?.id as number | undefined;
      if (savedId) {
        await putTemplatePlacements(savedId);
        setHadPlacements(spatialCount > 0);
      }
      const list = await loadFillingTemplates(kind, templateKey);
      setTemplates(list);
      if (savedId) setSelectedId(savedId);
      toast.success(payload?.updatedExisting ? "Filling Template updated" : "Filling Template saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save Filling Template");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: number, is_active: boolean) => {
    try {
      const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to update");
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, is_active } : t)));
      if (selectedId === id) setActive(is_active);
      toast.success(is_active ? "Template activated" : "Template deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const deleteTemplate = async () => {
    if (selectedId === "") return;
    setSaving(true);
    try {
      await deleteTemplateById(selectedId);
      const list = await loadFillingTemplates(kind, templateKey);
      setTemplates(list);
      resetEditor();
      toast.success("Filling Template deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const gridItems = useMemo(
    () =>
      items
        .filter((i) => i.category === "filling")
        .map((i) => ({
          id: i.id,
          label: getFillingDisplayLabel(i, templateKey),
          // name/subtype/size feed the bolster picker's family grouping.
          name: i.name,
          subtype: i.subtype,
          size: i.size,
        })),
    [items, templateKey],
  );
  // Derived BOM: same flatten the server runs over placement rows (ADR 0008).
  // Templates whose Placements sit in one Section: the 2026-07-24 backfill's
  // fill-cells-in-order spread, never laid out by a person (CONTEXT.md).
  const unauthoredCount = useMemo(() => templates.filter(isUnauthoredTemplate).length, [templates]);
  const visibleTemplates = templates.filter(
    (t) =>
      matchesTemplateSearch(t, search) &&
      (statusFilter === "all" || t.is_active === (statusFilter === "active")) &&
      (authoringFilter === "all" || isUnauthoredTemplate(t) === (authoringFilter === "unauthored")),
  );
  const packList = useMemo(
    () => flattenToPackList(kind === "pillow" ? placements : bolsterMix),
    [kind, placements, bolsterMix],
  );
  const isLegacyFlat = selectedId !== "" && !hadPlacements && lines.length > 0;
  const itemLabel = (itemId: number) => {
    const item = itemsById.get(itemId);
    return item ? getFillingDisplayLabel(item, templateKey) : `Item #${itemId}`;
  };
  // Compact per-cell breakdown for an unpromoted mix: "left/front: Soft, Soft".
  const cellSummary = (rows: PillowPlacementRow[]) => {
    const cells = new Map<string, number[]>();
    for (const r of rows) {
      const cell = `${r.section}/${r.sub_section}`;
      cells.set(cell, [...(cells.get(cell) ?? []), r.item_id]);
    }
    return Array.from(cells.entries()).map(
      ([cell, ids]) => `${cell}: ${ids.map((id) => itemLabel(id)).join(", ")}`,
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Filling-only mixes for operator assignment. Scoped to {kind === "pillow" ? "size" : "length"}{" "}
        <strong>{templateKey}</strong>.
      </p>
      <div className={WORKBENCH_GRID}>
      <TemplateRail
        title="Filling Templates"
        total={templates.length}
        search={search}
        onSearchChange={setSearch}
        action={
          <Button size="sm" variant="outline" onClick={resetEditor} disabled={saving}>
            <Plus className="size-4" />
            New
          </Button>
        }
        filters={
          <>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v === "active" || v === "inactive" ? v : "all")}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={authoringFilter}
              onValueChange={(v) => setAuthoringFilter(v === "authored" || v === "unauthored" ? v : "all")}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Layout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All layouts</SelectItem>
                <SelectItem value="authored">Spatially authored</SelectItem>
                <SelectItem value="unauthored">{`Not authored (${unauthoredCount})`}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        items={visibleTemplates.map((t) => (
          <TemplateRailItem
            key={t.id}
            selected={selectedId === t.id}
            onSelect={() => void selectTemplate(t.id)}
            title={t.name}
            meta={
              !t.is_active || isUnauthoredTemplate(t) ? (
                <>
                  {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {isUnauthoredTemplate(t) && <UnauthoredBadge sections={t.sections ?? []} />}
                </>
              ) : null
            }
            trailing={
              <Switch
                checked={t.is_active}
                onCheckedChange={(checked) => void toggleActive(t.id, checked)}
                aria-label={`${t.name} active`}
              />
            }
          />
        ))}
      />
      <div className="min-w-0 space-y-4">
      <WorkbenchHeader
        title={selectedId === "" ? "New Filling Template" : name.trim() || "Untitled Filling Template"}
        description={`${kind === "pillow" ? "Size" : "Length"} ${templateKey} · ${spatialCount} piece${spatialCount === 1 ? "" : "s"} placed`}
        actions={
          <>
            {selectedId !== "" && (
              <Button variant="outline" size="sm" disabled={saving} onClick={() => void deleteTemplate()}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
            <Button size="sm" onClick={() => void saveTemplate()} disabled={saving}>
              {saving ? "Saving…" : "Save Filling Template"}
            </Button>
          </>
        }
      />
      <div className="space-y-3 lg:rounded-xl lg:border lg:p-4">
      <div className="space-y-1 lg:hidden">
        <div className="text-sm font-medium text-muted-foreground">Template</div>
        <Select
          value={selectedId === "" ? "" : String(selectedId)}
          onValueChange={(v) => void selectTemplate(v ? Number(v) : "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="New template…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">New template…</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
                {!t.is_active ? " (inactive)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Filling Template name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          Active (selectable on assign)
        </label>
        <div className="flex gap-2 lg:hidden">
          <Button variant="secondary" onClick={() => void saveTemplate()} disabled={saving}>
            {saving ? "Saving…" : "Save Filling Template"}
          </Button>
          <Button variant="destructive" disabled={selectedId === "" || saving} onClick={() => void deleteTemplate()}>
            Delete
          </Button>
          <Button variant="outline" onClick={resetEditor} disabled={saving}>
            Clear
          </Button>
        </div>
      </div>
      </div>
      {templates.length > 0 && (
        <div className="rounded-lg border lg:hidden">
          {unauthoredCount > 0 && (
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              {unauthoredCount} of {templates.length} Filling Template
              {templates.length === 1 ? "" : "s"} not yet spatially authored — pieces are not laid
              out across the left, center and right sections.
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => void selectTemplate(t.id)}
                    >
                      {t.name}
                    </button>
                    {isUnauthoredTemplate(t) && <UnauthoredBadge sections={t.sections ?? []} className="ml-2" />}
                  </TableCell>
                  <TableCell>
                    <Switch checked={t.is_active} onCheckedChange={(checked) => void toggleActive(t.id, checked)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="space-y-3">
          {isLegacyFlat && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <div className="font-medium">Legacy flat recipe — saving spatially will set placements.</div>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {lines.map((l) => (
                  <li key={l.item_id}>
                    {itemLabel(l.item_id)} × {l.quantity}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Wide screens: the pack list sits beside the editor that derives it. */}
          <div className="space-y-3 xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:items-start xl:gap-4 xl:space-y-0">
          {kind === "pillow" ? (
            <Section title="Spatial recipe — click a section to dive in (up to 5 pieces per cell)">
              {placements.length > 0 && !isSpatiallyAuthored(placements) && (
                <div className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  <div className="font-medium">Not spatially authored.</div>
                  <p className="mt-1 text-muted-foreground">
                    {unauthoredReason(placements.map((p) => p.section))}{" "}
                    {looksLikeLegacyImport(placements.map((p) => p.section))
                      ? "These placements were auto-generated from a legacy flat recipe and have never been laid out. "
                      : ""}
                    Side-sleep support belongs in the left and right sections, back-sleep support in
                    center. Moving pieces between cells does not change the pack list.
                  </p>
                </div>
              )}
              <XrayEditor
                placements={placements}
                onPlacementsChange={setPlacements}
                items={gridItems}
                colorOverrides={colorOverrides}
              />
            </Section>
          ) : (
            // Mbolster: one long compartment, no piece cap, never the 3×3 grid — edited on
            // the same capsule x-ray the /mbolster-config staff assist uses.
            <Section title="Single compartment (ordered mix — no piece cap)">
              <XrayBolsterEditor
                placements={bolsterMix}
                length={BOLSTER_LENGTHS.find((l) => l === templateKey) ?? "medium"}
                onPlacementsChange={setBolsterMix}
                items={gridItems}
                colorOverrides={colorOverrides}
              />
            </Section>
          )}
          <Section title="Derived pack list">
            <ConfigureTable headers={["Filling", "Count"]}>
              {packList.map((line) => (
                <TableRow key={line.item_id}>
                  <TableCell className="font-medium">{itemLabel(line.item_id)}</TableCell>
                  <TableCell>{line.count}</TableCell>
                </TableRow>
              ))}
              {packList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-muted-foreground">
                    No pieces placed yet.
                  </TableCell>
                </TableRow>
              )}
            </ConfigureTable>
          </Section>
          </div>
          <Section title="Popular unpromoted mixes">
            {unpromoted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unpromoted mixes for {kind === "pillow" ? "size" : "length"} {templateKey} yet.
              </p>
            ) : (
              <div className="space-y-2">
                {unpromoted.map((entry, idx) => (
                  <div key={entry.fingerprint} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        #{idx + 1} · {entry.count} Result{entry.count === 1 ? "" : "s"} ·{" "}
                        {entry.packList.map((l) => `${itemLabel(l.item_id)} ×${l.count}`).join(", ")}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPromoteTarget(entry);
                          setPromoteName("");
                        }}
                      >
                        Promote
                      </Button>
                    </div>
                    {kind === "pillow" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {cellSummary(entry.placements as PillowPlacementRow[]).join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Dialog
            open={promoteTarget != null}
            onOpenChange={(o) => {
              if (!o) setPromoteTarget(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Promote to Filling Template</DialogTitle>
                <DialogDescription>
                  Creates a named active catalog Filling Template for{" "}
                  {kind === "pillow" ? "size" : "length"} {templateKey} from this mix. It leaves the
                  unpromoted list once promoted.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Template name"
                value={promoteName}
                onChange={(e) => setPromoteName(e.target.value)}
                autoFocus
              />
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPromoteTarget(null)} disabled={promoting}>
                  Cancel
                </Button>
                <Button onClick={() => void promoteMix()} disabled={promoting}>
                  {promoting ? "Promoting…" : "Promote"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </div>
      </div>
      </div>
    </div>
  );
}

function SizeEditor({ size, items, bom, setBom }: { size: Product["size"]; items: Item[]; bom: BomState; setBom: Dispatch<SetStateAction<BomState>> }) {
  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const sized = (category: Item["category"]) => items.filter((i) => i.category === category && i.size === size);
  const packaging = items.filter(
    (i) => i.category === "packaging" && ((size === "XS" || size === "S" || size === "M") ? i.size === "S" : i.size === "L"),
  );
  const accessories = items.filter((i) => i.category === "accessories" && (!i.size || i.size === size));
  const other = items.filter((i) => i.category === "other" && (!i.size || i.size === size));
  const lines = bom[size].filter((l) => itemsById.get(l.item_id)?.category !== "filling");

  const upsert = (item_id: number, quantity: number) => {
    const normalized = Number.isFinite(quantity) ? Math.max(0, Math.round(quantity)) : 0;
    setBom((prev: BomState) => {
      const next: BomState = { ...prev };
      if (normalized === 0) {
        next[size] = prev[size].filter((l) => l.item_id !== item_id);
        return next;
      }
      const idx = prev[size].findIndex((l) => l.item_id === item_id);
      if (idx === -1) {
        next[size] = [...prev[size], { item_id, quantity: normalized }];
      } else {
        next[size] = prev[size].map((l) => (l.item_id === item_id ? { ...l, quantity: normalized } : l));
      }
      return next;
    });
  };

  const remove = (item_id: number) => {
    setBom((prev: BomState) => ({ ...prev, [size]: prev[size].filter((l) => l.item_id !== item_id) }));
  };

  const linesForCategory = (category: Item["category"]) =>
    lines.filter((l) => itemsById.get(l.item_id)?.category === category);

  const uncategorizedLines = lines.filter((l) => {
    const cat = itemsById.get(l.item_id)?.category;
    return !cat || !KNOWN_CATEGORIES.includes(cat);
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium lg:hidden">Size {size}</h2>

      <DynamicPartSection
        title="Cover"
        sizeLabel={size}
        lines={linesForCategory("cover")}
        availableItems={sized("cover")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Pillow Case"
        sizeLabel={size}
        lines={linesForCategory("pillow_case")}
        availableItems={sized("pillow_case")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Pillow Protector"
        sizeLabel={size}
        lines={linesForCategory("pillow_protector")}
        availableItems={sized("pillow_protector")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Packaging"
        sizeLabel={size}
        lines={linesForCategory("packaging")}
        availableItems={packaging}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Accessories"
        sizeLabel={size}
        lines={linesForCategory("accessories")}
        availableItems={accessories}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Other"
        sizeLabel={size}
        lines={linesForCategory("other")}
        availableItems={other}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      {uncategorizedLines.length > 0 && (
        <DynamicPartSection
          title="Uncategorized"
          sizeLabel={size}
          lines={uncategorizedLines}
          availableItems={[]}
          getItem={(id) => itemsById.get(id)}
          upsert={upsert}
          remove={remove}
        />
      )}
      <Separator className="lg:hidden" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 lg:rounded-xl lg:border lg:p-4">
      <div className="text-sm font-medium text-muted-foreground lg:text-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function UnauthoredBadge({ sections, className }: { sections: string[]; className?: string }) {
  return (
    <span
      className={cn(
        "rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400",
        className,
      )}
      title={`${unauthoredReason(sections)}${
        looksLikeLegacyImport(sections)
          ? " Placements were auto-generated from a legacy flat recipe and have never been laid out."
          : ""
      }`}
    >
      Not spatially authored
    </span>
  );
}

/**
 * Desktop (lg+) template rail: the Products toolbar (search + Select filters)
 * stacked over a scrollable list. Phones keep the inline template Select.
 */
function TemplateRail({
  title,
  total,
  search,
  onSearchChange,
  filters,
  action,
  items,
}: {
  title: string;
  total: number;
  search: string;
  onSearchChange: (value: string) => void;
  filters: ReactNode;
  action?: ReactNode;
  items: ReactNode[];
}) {
  return (
    <aside className="hidden flex-col rounded-xl border lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100svh-2rem)]">
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">
              {items.length === total ? `${total} total` : `${items.length} of ${total}`}
            </div>
          </div>
          {action}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* Stacked: the rail is too narrow for two triggers side by side. */}
        <div className="grid gap-2">{filters}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length ? (
          <ul className="space-y-1">{items}</ul>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {total ? "No templates match your filters." : "No templates yet."}
          </div>
        )}
      </div>
    </aside>
  );
}

function TemplateRailItem({
  selected,
  onSelect,
  title,
  meta,
  trailing,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg pr-2 transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-sm font-medium">{title}</span>
        {meta ? (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{meta}</span>
        ) : null}
      </button>
      {trailing}
    </li>
  );
}

/** Warehouse (non-filling BOM) templates: search + sort, plus an optional scope filter. */
function WarehouseTemplateRail({
  templates,
  selectedId,
  onSelect,
  scopeFilter,
}: {
  templates: Array<{ id: number; name: string; notes: string | null }>;
  selectedId: number | "";
  onSelect: (id: number) => void;
  scopeFilter?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  // The templates API already returns most recently updated first.
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const matching = templates.filter((t) => matchesTemplateSearch(t, search));
  const visible = sort === "name" ? [...matching].sort((a, b) => a.name.localeCompare(b.name)) : matching;
  return (
    <TemplateRail
      title="Warehouse templates"
      total={templates.length}
      search={search}
      onSearchChange={setSearch}
      filters={
        <>
          {scopeFilter}
          <Select value={sort} onValueChange={(v) => setSort(v === "name" ? "name" : "recent")}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recently updated</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      items={visible.map((t) => (
        <TemplateRailItem
          key={t.id}
          selected={selectedId === t.id}
          onSelect={() => onSelect(t.id)}
          title={t.name}
          meta={t.notes ? <span className="block w-full truncate">{t.notes}</span> : null}
        />
      ))}
    />
  );
}

/** Desktop (lg+) workbench title bar, pinned so Save stays in reach down a long BOM. */
function WorkbenchHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 hidden items-center justify-between gap-4 border-b bg-background/95 py-3 backdrop-blur lg:flex">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-medium">{title}</h2>
        <p className="truncate text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

function ConfigureTable({
  headers,
  children,
  pinFirstColumn = false,
}: {
  headers: string[];
  children: React.ReactNode;
  /** Phones: keep the first column in view while the rest scrolls sideways. */
  pinFirstColumn?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h, i) => (
            <TableHead
              key={h}
              className={
                pinFirstColumn && i === 0 ? stickyFirstColumnHeadClassName : "whitespace-nowrap"
              }
            >
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {children}
      </TableBody>
    </Table>
  );
}

type DynamicPartSectionProps = {
  title: string;
  sizeLabel?: string;
  lines: BomLine[];
  availableItems: Item[];
  getItem: (id: number) => Item | undefined;
  upsert: (itemId: number, quantity: number) => void;
  remove: (itemId: number) => void;
  variantResolver?: (item: Item, fallbackSize?: string) => string;
  optionLabelResolver?: (item: Item) => string;
};

function DynamicPartSection({
  title,
  sizeLabel,
  lines,
  availableItems,
  getItem,
  upsert,
  remove,
  variantResolver,
  optionLabelResolver,
}: DynamicPartSectionProps) {
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number>(1);

  const existingIds = useMemo(() => new Set(lines.map((l) => l.item_id)), [lines]);
  const addable = availableItems.filter((i) => !existingIds.has(i.id));

  const renderOptionLabel = (item: Item) => {
    if (optionLabelResolver) return optionLabelResolver(item);
    return getItemBaseName(item);
  };

  const renderVariant = (item?: Item) => {
    if (!item) return sizeLabel ?? "—";
    if (variantResolver) return variantResolver(item, sizeLabel);
    return item.size ?? sizeLabel ?? "—";
  };

  const handleAdd = () => {
    if (selectedId === "" || quantity <= 0) return;
    upsert(Number(selectedId), quantity);
    setSelectedId("");
    setQuantity(1);
  };

  const handleQtyChange = (itemId: number, value: string) => {
    const parsed = Number.parseInt(value || "0", 10);
    upsert(itemId, Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <Section title={title}>
      <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]} pinFirstColumn>
        {lines.map((l) => {
          const item = getItem(l.item_id);
          return (
            <TableRow key={l.item_id}>
              <TableCell className={`${stickyFirstColumnCellClassName} font-medium`}>
                {item ? getItemBaseName(item) : `Item #${l.item_id}`}
              </TableCell>
              <TableCell className="min-w-[7rem] sm:min-w-0">{renderVariant(item)}</TableCell>
              <TableCell className="w-[6.5rem] min-w-[6.5rem] sm:w-[140px]">
                <Input
                  type="number"
                  min={0}
                  value={l.quantity}
                  onFocus={(e) => requestAnimationFrame(() => e.currentTarget.select())}
                  onClick={(e) => requestAnimationFrame(() => e.currentTarget.select())}
                  onChange={(e) => handleQtyChange(l.item_id, e.target.value)}
                />
              </TableCell>
              <TableCell className="min-w-[6rem] sm:w-[140px]">
                <Button size="sm" variant="secondary" onClick={() => remove(l.item_id)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        {lines.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-sm text-muted-foreground">
              No parts added yet.
            </TableCell>
          </TableRow>
        )}
        <TableRow>
          <TableCell colSpan={2} className="min-w-[14rem] sm:min-w-0">
              <div className="flex items-center gap-2">
                <Select
                  value={selectedId === "" ? "" : String(selectedId)}
                  onValueChange={(value) => setSelectedId(value ? Number(value) : "")}
                >
                  <SelectTrigger className="w-full" disabled={addable.length === 0}>
                    <SelectValue placeholder={addable.length ? "Select part to add" : "All available parts added"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" disabled={addable.length === 0}>
                      {addable.length ? "Select part to add" : "All available parts added"}
                    </SelectItem>
                    {addable.map((it) => (
                      <SelectItem key={it.id} value={String(it.id)}>
                        {renderOptionLabel(it)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
          </TableCell>
          <TableCell className="w-[6.5rem] min-w-[6.5rem] sm:w-[140px]">
            <Input
              type="number"
              min={0}
              value={quantity}
              onFocus={(e) => requestAnimationFrame(() => e.currentTarget.select())}
              onClick={(e) => requestAnimationFrame(() => e.currentTarget.select())}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || "0", 10);
                setQuantity(Number.isFinite(parsed) ? parsed : 0);
              }}
            />
          </TableCell>
          <TableCell className="min-w-[6rem] sm:w-[140px]">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={selectedId === "" || quantity <= 0 || !Number.isFinite(quantity)}
            >
              Add part
            </Button>
          </TableCell>
        </TableRow>
      </ConfigureTable>
    </Section>
  );
}

function BolsterEditor({
  items,
  lines,
  setLines,
  variant,
}: {
  items: Item[];
  lines: BomLine[];
  setLines: Dispatch<SetStateAction<BomLine[]>>;
  variant: 'Short (0.8m)' | 'Medium (1m)' | 'Long (1.2m)' | null;
}) {
  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  // Variant size mapping:
  // short -> S, medium -> M, long -> L
  // We keep a fallback to legacy BOLSTER-sized items if no S/M/L items exist yet.
  const variantSize = useMemo(() => {
    if (!variant) return null;
    if (variant.startsWith("Short")) return "S";
    if (variant.startsWith("Long")) return "L";
    return "M";
  }, [variant]);

  const sized = (category: Item["category"]) => {
    const byVariantSize =
      variantSize
        ? items.filter((i) => i.category === category && sizeEquals(i.size, variantSize))
        : [];
    if (byVariantSize.length) return byVariantSize;
    return items.filter((i) => i.category === category && sizeEquals(i.size, "BOLSTER"));
  };
  const packaging = items.filter((i) => i.category === "packaging" && i.size === "S");
  const accessories = items.filter(
    (i) =>
      i.category === "accessories" &&
      (!i.size ||
        (variantSize ? sizeEquals(i.size, variantSize) : false) ||
        sizeEquals(i.size, "BOLSTER")),
  );
  const other = items.filter(
    (i) =>
      i.category === "other" &&
      (!i.size ||
        (variantSize ? sizeEquals(i.size, variantSize) : false) ||
        sizeEquals(i.size, "BOLSTER")),
  );

  const upsert = (item_id: number, quantity: number) => {
    const normalized = Number.isFinite(quantity) ? Math.max(0, Math.round(quantity)) : 0;
    setLines((prev: BomLine[]) => {
      if (normalized === 0) {
        return prev.filter((l) => l.item_id !== item_id);
      }
      const idx = prev.findIndex((l) => l.item_id === item_id);
      if (idx === -1) return [...prev, { item_id, quantity: normalized }];
      return prev.map((l) => (l.item_id === item_id ? { ...l, quantity: normalized } : l));
    });
  };

  const remove = (item_id: number) => {
    setLines((prev: BomLine[]) => prev.filter((l) => l.item_id !== item_id));
  };

  const linesForCategory = (category: Item["category"]) =>
    lines.filter((l) => itemsById.get(l.item_id)?.category === category);

  const uncategorizedLines = lines.filter((l) => {
    const cat = itemsById.get(l.item_id)?.category;
    if (cat === "filling") return false;
    return !cat || !KNOWN_CATEGORIES.includes(cat);
  });

  return (
    <div className="space-y-4">
      <DynamicPartSection
        title="Bolster Case"
        sizeLabel={variantSize ?? "Bolster"}
        lines={linesForCategory("bolster_case")}
        availableItems={sized("bolster_case")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Bolster Protector"
        sizeLabel={variantSize ?? "Bolster"}
        lines={linesForCategory("bolster_protector")}
        availableItems={sized("bolster_protector")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Packaging (typical)"
        sizeLabel={variantSize ?? "Bolster"}
        lines={linesForCategory("packaging")}
        availableItems={packaging}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Accessories"
        sizeLabel={variantSize ?? "Bolster"}
        lines={linesForCategory("accessories")}
        availableItems={accessories}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Other"
        sizeLabel={variantSize ?? "Bolster"}
        lines={linesForCategory("other")}
        availableItems={other}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      {uncategorizedLines.length > 0 && (
        <DynamicPartSection
          title="Uncategorized"
          sizeLabel={variantSize ?? "Bolster"}
          lines={uncategorizedLines}
          availableItems={[]}
          getItem={(id) => itemsById.get(id)}
          upsert={upsert}
          remove={remove}
        />
      )}
      <Separator className="lg:hidden" />
    </div>
  );
}
