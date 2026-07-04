"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";

type FillingTemplateRow = {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
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

type Product = { id: number; size: "XS" | "S" | "M" | "L" | "XL"; kind: PillowKind };

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

export default function ConfigureInventoryPage() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const settingsPath = useCallback((path: string) => withLocale(path, locale), [locale]);

  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bomByKind, setBomByKind] = useState<BomByKind>(() => makeEmptyBomByKind());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Product["size"] | null>(null);
  const [selectedPillowKind, setSelectedPillowKind] = useState<PillowKind | null>(null);
  const [bolsterOpen, setBolsterOpen] = useState(false);
  const [bolsterVariant, setBolsterVariant] = useState<'Short (0.8m)' | 'Medium (1m)' | 'Long (1.2m)' | null>(null);
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

  // Filling Templates (sale path) — size-scoped, filling lines only.
  const [ftKind, setFtKind] = useState<"pillow" | "bolster">("pillow");
  const [ftKey, setFtKey] = useState<string>("M");
  const [ftTemplates, setFtTemplates] = useState<FillingTemplateRow[]>([]);
  const [ftSelectedId, setFtSelectedId] = useState<number | "">("");
  const [ftName, setFtName] = useState("");
  const [ftNotes, setFtNotes] = useState("");
  const [ftActive, setFtActive] = useState(true);
  const [ftLines, setFtLines] = useState<BomLine[]>([]);
  const [ftSaving, setFtSaving] = useState(false);

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
    const [{ data: itemsData }, { data: productsData }, { data: bomData }] = await Promise.all([
      supabaseClient.from("items").select("id,category,subtype,name,size").eq("is_active", true),
      supabaseClient.from("pillow_products").select("id,size,kind").eq("is_active", true),
      supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
    ]);
    setItems(normalizeDbItems((itemsData ?? []) as DbItem[]));
    setProducts((productsData ?? []) as Product[]);
    const next: BomByKind = makeEmptyBomByKind();
    type BomRow = { product_id: number; item_id: number; quantity: number | string };
    const prods = (productsData ?? []) as Product[];
    (bomData ?? []).forEach((row: BomRow) => {
      const product = prods.find((p) => p.id === row.product_id);
      if (!product) return;
      const kind = product.kind as PillowKind;
      const size = product.size as Product["size"];
      if (kind !== "basic" && kind !== "premium") return;
      // Defensive de-dupe: never allow the same item_id twice for one (kind,size).
      const itemId = Number(row.item_id);
      const quantity = Number(row.quantity);
      const existingIdx = next[kind][size].findIndex((l) => l.item_id === itemId);
      if (existingIdx === -1) next[kind][size].push({ item_id: itemId, quantity });
      else next[kind][size][existingIdx] = { item_id: itemId, quantity };
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
    try {
      // Load a default cache (medium) only once; specific variant will reload on open
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('bolster_bom_lines:medium') : null;
      if (raw) {
        const parsed = JSON.parse(raw) as BomLine[];
        setBolsterLines(Array.isArray(parsed) ? parsed : []);
      }
    } catch {}
  }, []);

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
      if (rows.length) {
        setBolsterLines(rows);
      } else {
        try {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(`bolster_bom_lines:${variant}`) : null;
          if (raw) {
            const parsed = JSON.parse(raw) as BomLine[];
            setBolsterLines(Array.isArray(parsed) ? parsed : []);
          } else {
            setBolsterLines([]);
          }
        } catch {
          setBolsterLines([]);
        }
      }
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
  }, [open, selectedSize, selectedPillowKind, premiumVariant]);

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
  }, [bolsterOpen, bolsterVariant, getBolsterTemplateKey]);

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

  const persistProductBom = async (productId: number, lines: BomLine[]) => {
    const payloadLines = buildPayloadLines(lines);
    const response = await fetch(settingsPath("/settings/inventory/configure/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, lines: payloadLines }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error ?? "Failed to save configuration";
      throw new Error(message);
    }
  };

  const loadTemplates = async (kind: 'pillow' | 'bolster', key: string, pillowKind?: PillowKind, pillowVariant?: PremiumVariant) => {
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
  }

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
    return (payload?.templates ?? []) as FillingTemplateRow[];
  }, [settingsPath]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadFillingTemplates(ftKind, ftKey);
        if (cancelled) return;
        setFtTemplates(list);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load Filling Templates");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ftKind, ftKey, loadFillingTemplates]);

  const resetFillingEditor = () => {
    setFtSelectedId("");
    setFtName("");
    setFtNotes("");
    setFtActive(true);
    setFtLines([]);
  };

  const selectFillingTemplate = async (id: number | "") => {
    setFtSelectedId(id);
    if (id === "") {
      setFtName("");
      setFtNotes("");
      setFtActive(true);
      setFtLines([]);
      return;
    }
    const meta = ftTemplates.find((t) => t.id === id);
    setFtName(meta?.name ?? "");
    setFtNotes(meta?.notes ?? "");
    setFtActive(meta?.is_active ?? true);
    try {
      const lines = await loadTemplateLines(id);
      setFtLines(lines);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load template lines");
    }
  };

  const saveFillingTemplate = async () => {
    const name = ftName.trim();
    if (!name) {
      toast.message("Enter a Filling Template name");
      return;
    }
    setFtSaving(true);
    try {
      const res = await fetch(settingsPath("/settings/inventory/configure/templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: ftKind,
          key: ftKey,
          name,
          notes: ftNotes.trim() || undefined,
          role: "filling",
          is_active: ftActive,
          lines: buildPayloadLines(ftLines),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save Filling Template");
      const list = await loadFillingTemplates(ftKind, ftKey);
      setFtTemplates(list);
      const savedId = payload?.template?.id as number | undefined;
      if (savedId) {
        setFtSelectedId(savedId);
      }
      toast.success(payload?.updatedExisting ? "Filling Template updated" : "Filling Template saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save Filling Template");
    } finally {
      setFtSaving(false);
    }
  };

  const toggleFillingActive = async (id: number, is_active: boolean) => {
    try {
      const res = await fetch(settingsPath(`/settings/inventory/configure/templates/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to update");
      setFtTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, is_active } : t)));
      if (ftSelectedId === id) setFtActive(is_active);
      toast.success(is_active ? "Template activated" : "Template deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const deleteFillingTemplate = async () => {
    if (ftSelectedId === "") return;
    setFtSaving(true);
    try {
      await deleteTemplateById(ftSelectedId);
      const list = await loadFillingTemplates(ftKind, ftKey);
      setFtTemplates(list);
      resetFillingEditor();
      toast.success("Filling Template deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setFtSaving(false);
    }
  };

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

  const save = async () => {
    if (products.length === 0) {
      toast.message("No active pillow products to save");
      return;
    }
    setSaving(true);
    try {
      for (const product of products) {
        const kind = product.kind as PillowKind;
        if (kind !== "basic" && kind !== "premium") continue;
        await persistProductBom(product.id, bomByKind[kind][product.size]);
      }
      toast.success("Configuration saved for all sizes");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveBolster = async () => {
    if (!bolsterVariant) {
      toast.message("Select a bolster variant to save");
      return;
    }
    setSaving(true);
    try {
      const variant = bolsterVariant === 'Short (0.8m)'
        ? 'short' : bolsterVariant === 'Long (1.2m)'
        ? 'long' : 'medium';
      const lines = buildPayloadLines(bolsterLines ?? []);
      const response = await fetch(settingsPath("/settings/inventory/configure/save"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bolster', variant, lines }),
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
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`bolster_bom_lines:${variant}`, JSON.stringify(lines));
      }
      toast.success('Bolster configuration saved');
      notifyInventoryChange();
      setBolsterOpen(false);
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
      await persistProductBom(product.id, bomByKind[kind][size]);
      toast.success(`${kind === 'basic' ? 'Basic' : 'Premium'} configuration saved for size ${size}`);
      notifyInventoryChange();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Configure Products</h1>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="text-2xl font-semibold">Basic Mpillow</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SIZES.map((size) => {
            const partsCount = bomByKind.basic[size].filter(l => (l.quantity ?? 0) > 0).length;
            return (
              <div
                key={`basic-${size}`}
                role="button"
                tabIndex={0}
                onClick={()=> { setSelectedPillowKind('basic'); setSelectedSize(size); setOpen(true); }}
                onKeyDown={(e)=> { if (e.key==='Enter' || e.key===' ') { setSelectedPillowKind('basic'); setSelectedSize(size); setOpen(true); } }}
                className="rounded-lg border p-4 hover:bg-muted/50 cursor-pointer select-none"
              >
                <div className="text-xs text-muted-foreground">Size</div>
                <div className="text-2xl font-semibold">{size}</div>
                <div className="mt-2 text-xs text-muted-foreground">{partsCount} parts configured</div>
                <div className="mt-3">
                  <Button size="sm" variant="secondary">Configure</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="text-2xl font-semibold">Premium Mpillow</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SIZES.map((size) => {
            const partsCount = bomByKind.premium[size].filter(l => (l.quantity ?? 0) > 0).length;
            return (
              <div
                key={`premium-${size}`}
                role="button"
                tabIndex={0}
                onClick={()=> { setSelectedPillowKind('premium'); setSelectedSize(size); setOpen(true); }}
                onKeyDown={(e)=> { if (e.key==='Enter' || e.key===' ') { setSelectedPillowKind('premium'); setSelectedSize(size); setOpen(true); } }}
                className="rounded-lg border p-4 hover:bg-muted/50 cursor-pointer select-none"
              >
                <div className="text-xs text-muted-foreground">Size</div>
                <div className="text-2xl font-semibold">{size}</div>
                <div className="mt-2 text-xs text-muted-foreground">{partsCount} parts configured</div>
                <div className="mt-3">
                  <Button size="sm" variant="secondary">Configure</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />
      <div className="space-y-2">
        <div className="text-2xl font-semibold">Mbolster</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: 'Short (0.8m)' as const, label: 'Short (0.8m)' },
            { key: 'Medium (1m)' as const, label: 'Medium (1m)' },
            { key: 'Long (1.2m)' as const, label: 'Long (1.2m)' },
          ].map(v => (
            <div
              key={v.key}
              role="button"
              tabIndex={0}
              onClick={()=> { setBolsterVariant(v.key); setBolsterOpen(true); }}
              onKeyDown={(e)=> { if (e.key==='Enter' || e.key===' ') { setBolsterVariant(v.key); setBolsterOpen(true); } }}
              className="rounded-lg border p-4 hover:bg-muted/50 cursor-pointer select-none"
            >
              <div className="text-xs text-muted-foreground">Bolster</div>
              <div className="text-2xl font-semibold">{v.label}</div>
              <div className="mt-2 text-xs text-muted-foreground">Case, Protector, 6D (L)</div>
              <div className="mt-3">
                <Button size="sm" variant="secondary">Configure</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />
      <div className="space-y-4">
        <div>
          <div className="text-2xl font-semibold">Filling Templates</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Filling-only recipes for operator assignment. Scoped by product type and size.
            Packaging and protector stay on the composed sellable BOM above.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Product type</div>
            <Select
              value={ftKind}
              onValueChange={(v) => {
                if (v !== "pillow" && v !== "bolster") return;
                setFtKind(v);
                setFtKey(v === "pillow" ? "M" : "medium");
                resetFillingEditor();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pillow">Pillow</SelectItem>
                <SelectItem value="bolster">Bolster</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">
              {ftKind === "pillow" ? "Size" : "Length"}
            </div>
            <Select
              value={ftKey}
              onValueChange={(v) => {
                setFtKey(v);
                resetFillingEditor();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(ftKind === "pillow" ? SIZES : (["short", "medium", "long"] as const)).map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Template</div>
            <Select
              value={ftSelectedId === "" ? "" : String(ftSelectedId)}
              onValueChange={(v) => {
                void selectFillingTemplate(v ? Number(v) : "");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="New template…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">New template…</SelectItem>
                {ftTemplates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                    {!t.is_active ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Filling Template name"
            value={ftName}
            onChange={(e) => setFtName(e.target.value)}
          />
          <Input
            placeholder="Notes (optional)"
            value={ftNotes}
            onChange={(e) => setFtNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ftActive} onCheckedChange={setFtActive} />
            Active (selectable on assign)
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void saveFillingTemplate()} disabled={ftSaving}>
              {ftSaving ? "Saving…" : "Save Filling Template"}
            </Button>
            <Button
              variant="destructive"
              disabled={ftSelectedId === "" || ftSaving}
              onClick={() => void deleteFillingTemplate()}
            >
              Delete
            </Button>
            <Button variant="outline" onClick={resetFillingEditor} disabled={ftSaving}>
              Clear
            </Button>
          </div>
        </div>
        {ftTemplates.length > 0 && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ftTemplates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => void selectFillingTemplate(t.id)}
                      >
                        {t.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={(checked) => void toggleFillingActive(t.id, checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <FillingLinesEditor
          items={items}
          lines={ftLines}
          setLines={setFtLines}
          sizeLabel={ftKey}
        />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              Configure {selectedPillowKind === 'premium' ? 'Premium' : 'Basic'} — Size {selectedSize ?? ''}
            </SheetTitle>
            <SheetDescription>Adjust BOM quantities and save for this pillow size.</SheetDescription>
          </SheetHeader>
          {selectedSize && selectedPillowKind && (
            <div className="mt-4 space-y-3 px-4">
              {selectedPillowKind === 'premium' && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Premium variant</div>
                  <Select
                    value={premiumVariant}
                    onValueChange={(value) => {
                      if (value === 'linen' || value === 'fibrecool') {
                        setPremiumVariant(value);
                        setPillowSelectedTemplateId('');
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
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Template</div>
                  <Select
                    value={pillowSelectedTemplateId === '' ? '' : String(pillowSelectedTemplateId)}
                    onValueChange={async (value) => {
                      const next: number | '' = value ? Number(value) : '';
                      setPillowSelectedTemplateId(next);
                      if (next === '') return;
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
                    }}
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
              <Separator />
            </div>
          )}
          <div className="mt-4 space-y-4 px-4">
            {selectedSize && selectedPillowKind && (
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
            )}
          </div>
          <SheetFooter>
            <Button
              onClick={() => {
                if (!selectedPillowKind || !selectedSize) return;
                saveSelected(selectedPillowKind, selectedSize);
              }}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bolster Sheet */}
      <Sheet open={bolsterOpen} onOpenChange={setBolsterOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Configure Bolster{bolsterVariant ? ` — ${bolsterVariant}` : ''}</SheetTitle>
            <SheetDescription>Adjust components and quantities for the single-size bolster, including packaging.</SheetDescription>
          </SheetHeader>
          {bolsterVariant && (
            <div className="mt-4 space-y-3 px-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Template</div>
                  <Select
                    value={bolsterSelectedTemplateId === '' ? '' : String(bolsterSelectedTemplateId)}
                    onValueChange={async (value) => {
                      const next: number | '' = value ? Number(value) : '';
                      setBolsterSelectedTemplateId(next);
                      if (next === '') return;
                      try {
                        const lines = await loadTemplateLines(next);
                        setBolsterLines(lines);
                        toast.success('Template loaded into editor');
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Failed to load template');
                      }
                    }}
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
                        const key = bolsterVariant ? getBolsterTemplateKey(bolsterVariant) : 'medium';
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
              <Separator />
            </div>
          )}
          <div className="mt-4 space-y-4 px-4">
            <BolsterEditor
              items={items}
              lines={bolsterLines}
              setLines={setBolsterLines}
              variant={bolsterVariant}
            />
          </div>
          <SheetFooter>
            <Button onClick={saveBolster} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
  // Fillings are universal: available for all products (no size filtering).
  const fillings = items.filter((i) => i.category === "filling");
  const packaging = items.filter(
    (i) => i.category === "packaging" && ((size === "XS" || size === "S" || size === "M") ? i.size === "S" : i.size === "L"),
  );
  const accessories = items.filter((i) => i.category === "accessories" && (!i.size || i.size === size));
  const other = items.filter((i) => i.category === "other" && (!i.size || i.size === size));
  const lines = bom[size];

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
      <h2 className="text-xl font-medium">Size {size}</h2>

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
        title="Fillings"
        sizeLabel={size}
        lines={linesForCategory("filling")}
        availableItems={fillings}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
        variantResolver={(item, fallbackSize) => item.size ?? fallbackSize ?? normalizeNameOrFallback(item.subtype ?? item.name, "filling")}
        optionLabelResolver={(item) => getFillingDisplayLabel(item, size)}
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
      <Separator />
    </div>
  );
}

function FillingLinesEditor({
  items,
  lines,
  setLines,
  sizeLabel,
}: {
  items: Item[];
  lines: BomLine[];
  setLines: Dispatch<SetStateAction<BomLine[]>>;
  sizeLabel: string;
}) {
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const fillings = useMemo(() => items.filter((i) => i.category === "filling"), [items]);

  const upsert = (itemId: number, quantity: number) => {
    setLines((prev) => {
      const rest = prev.filter((l) => l.item_id !== itemId);
      if (quantity <= 0) return rest;
      return [...rest, { item_id: itemId, quantity }];
    });
  };
  const remove = (itemId: number) => setLines((prev) => prev.filter((l) => l.item_id !== itemId));

  return (
    <DynamicPartSection
      title="Fillings"
      sizeLabel={sizeLabel}
      lines={lines}
      availableItems={fillings}
      getItem={(id) => itemsById.get(id)}
      upsert={upsert}
      remove={remove}
      variantResolver={(item, fallbackSize) =>
        item.size ?? fallbackSize ?? normalizeNameOrFallback(item.subtype ?? item.name, "filling")
      }
      optionLabelResolver={(item) => getFillingDisplayLabel(item, sizeLabel)}
    />
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

function ConfigureTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
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
      <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]}>
        {lines.map((l) => {
          const item = getItem(l.item_id);
          return (
            <TableRow key={l.item_id}>
              <TableCell className="font-medium">{item ? getItemBaseName(item) : `Item #${l.item_id}`}</TableCell>
              <TableCell>{renderVariant(item)}</TableCell>
              <TableCell className="w-[140px]">
                <Input
                  type="number"
                  min={0}
                  value={l.quantity}
                  onFocus={(e) => requestAnimationFrame(() => e.currentTarget.select())}
                  onClick={(e) => requestAnimationFrame(() => e.currentTarget.select())}
                  onChange={(e) => handleQtyChange(l.item_id, e.target.value)}
                />
              </TableCell>
              <TableCell className="w-[140px]">
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
          <TableCell colSpan={2}>
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
          <TableCell className="w-[140px]">
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
          <TableCell className="w-[140px]">
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
  // Fillings are universal: available for all products (no size filtering).
  const fillings = items.filter((i) => i.category === "filling");
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
        title="Fillings"
        sizeLabel={variantSize ?? "Bolster"}
        lines={linesForCategory("filling")}
        availableItems={fillings}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
        variantResolver={(item, fallbackSize) => item.size ?? fallbackSize ?? normalizeNameOrFallback(item.subtype ?? item.name, "filling")}
        optionLabelResolver={(item) => getFillingDisplayLabel(item, variantSize ?? "Bolster")}
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
      <Separator />
    </div>
  );
}
