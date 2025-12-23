"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import {
  sellPillow,
  sellPart,
  receiveStock,
  sellBolster,
  addInventoryItem,
  deleteInventoryItem,
  renameInventoryItem,
} from "./actions";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  InventoryItemLabel,
  getInventoryItemDisplayLabel,
  getInventoryItemLabelParts,
  getInventoryVariantName,
} from "./item-label";

const ITEM_CATEGORIES = ['cover','case','protector','filling','packaging','accessories','other'] as const;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];
const CATEGORY_TITLES: Record<ItemCategory, string> = {
  cover: 'Covers',
  case: 'Cases',
  protector: 'Protectors',
  filling: 'Fillings',
  packaging: 'Packaging',
  accessories: 'Accessories',
  other: 'Other',
};
const SIZED_CATEGORIES: ItemCategory[] = ['cover','case','protector'];
const SIZE_OPTIONS = ['-','XS','S','M','L','XL'] as const;

type Item = { id: number; category: ItemCategory; subtype: string | null; name: string; size: string | null };
type Product = { id: number; size: string };
type AddInventoryDraft = {
  category: ItemCategory;
  name: string;
  size?: string;
  subtype?: string;
  initialStock: number;
  costPrice?: number;
  msrp?: number;
};
type AddInventoryEntry = {
  category: ItemCategory;
  name: string;
  size: string;
  subtype: string;
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
  initialStock: "",
  costPrice: "",
  msrp: "",
});

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [buildable, setBuildable] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [partDrawerOpen, setPartDrawerOpen] = useState(false);
  const [partDrawerGroup, setPartDrawerGroup] = useState<Group | null>(null);
  const [cart, setCart] = useState<{
    pillows: Record<string, number>;
    parts: Record<number, number>;
  }>({ pillows: {}, parts: {} });
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
    const [{ data: itemsData }, { data: balancesData }, { data: productsData }, { data: buildableData }] = await Promise.all([
      supabaseClient.from("items").select("id,category,subtype,name,size").eq("is_active", true),
      supabaseClient.from("inventory_balances").select("item_id,on_hand"),
      supabaseClient.from("pillow_products").select("id,size"),
      supabaseClient.from("product_buildable").select("product_id,size,buildable"),
    ]);
    setItems((itemsData ?? []) as Item[]);
    type BalanceRow = { item_id: number; on_hand: number | string };
    setBalances(Object.fromEntries((balancesData ?? []).map((r: BalanceRow)=> [r.item_id, Number(r.on_hand)] )));
    setProducts((productsData ?? []) as Product[]);
    type BuildableRow = { size: string; buildable: number | string };
    const build = Object.fromEntries((buildableData ?? []).map((r: BuildableRow)=> [r.size, Number(r.buildable)] ));
    setBuildable(build);
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

  const handleCreateItem = async (draft: AddInventoryDraft) => {
    try {
      await addInventoryItem({
        category: draft.category,
        name: draft.name,
        size: draft.size,
        subtype: draft.subtype,
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
    const loadBolster = async () => {
      type LineRow = { variant: 'short'|'medium'|'long'; item_id: number; quantity: number | string };
      const { data } = await supabaseClient.from('bolster_bom_lines').select('variant,item_id,quantity');
      const grouped: Record<'short'|'medium'|'long', Array<{ item_id: number; quantity: number }>> = { short: [], medium: [], long: [] };
      (data ?? []).forEach((r: LineRow) => {
        const q = Number(r.quantity);
        grouped[r.variant].push({ item_id: r.item_id, quantity: q });
      });
      // Fallback from localStorage if any variant missing
      (['short','medium','long'] as const).forEach((v) => {
        if (grouped[v].length === 0) {
          try {
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem(`bolster_bom_lines:${v}`) : null;
            if (raw) {
              const parsed = JSON.parse(raw) as Array<{ item_id: number; quantity: number }>;
              if (Array.isArray(parsed)) grouped[v] = parsed;
            }
          } catch {}
        }
      });
      setBolsterLinesByVariant(grouped);
    };
    loadBolster();
  }, []);

  useEffect(() => {
    const loadCustomPillowLines = async () => {
      if (!customPillowDrawerOpen) return;
      const product = products.find(p => p.size === customPillowSize);
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
    return items.filter(i => (balances[i.id] ?? 0) <= 0);
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
    setCart(prev => ({ ...prev, pillows: { ...prev.pillows, [size]: (prev.pillows[size] ?? 0) + 1 } }));
    toast.message(`Selected 1 pillow size ${size}`);
  };

  const buildableBolsterShort = useMemo(() => {
    const lines = bolsterLinesByVariant.short;
    if (!lines.length) return 0;
    const counts = lines.map(l => Math.floor((Number(balances[l.item_id] ?? 0)) / Math.max(1, Number(l.quantity))));
    return counts.length ? Math.max(0, Math.min(...counts)) : 0;
  }, [balances, bolsterLinesByVariant]);
  const buildableBolsterMedium = useMemo(() => {
    const lines = bolsterLinesByVariant.medium;
    if (!lines.length) return 0;
    const counts = lines.map(l => Math.floor((Number(balances[l.item_id] ?? 0)) / Math.max(1, Number(l.quantity))));
    return counts.length ? Math.max(0, Math.min(...counts)) : 0;
  }, [balances, bolsterLinesByVariant]);
  const buildableBolsterLong = useMemo(() => {
    const lines = bolsterLinesByVariant.long;
    if (!lines.length) return 0;
    const counts = lines.map(l => Math.floor((Number(balances[l.item_id] ?? 0)) / Math.max(1, Number(l.quantity))));
    return counts.length ? Math.max(0, Math.min(...counts)) : 0;
  }, [balances, bolsterLinesByVariant]);

  const incrementPartSelection = (itemId: number) => {
    setCart(prev => ({ ...prev, parts: { ...prev.parts, [itemId]: (prev.parts[itemId] ?? 0) + 1 } }));
  };

  const undoCartLine = (type: "pillow" | "part", key: string | number) => {
    setCart(prev => {
      if (type === "pillow") {
        const size = String(key);
        const nextQty = Math.max(0, (prev.pillows[size] ?? 0) - 1);
        const next = { ...prev.pillows };
        if (nextQty === 0) delete next[size]; else next[size] = nextQty;
        return { ...prev, pillows: next };
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
    const pillowEntries = Object.entries(cart.pillows);
    const partEntries = Object.entries(cart.parts);
    if (pillowEntries.length === 0 && partEntries.length === 0) {
      toast.message("Cart is empty");
      return;
    }
    try {
      // Process pillows
      for (const [size, qty] of pillowEntries) {
        if (size === 'Bolster' || String(size).startsWith('Bolster')) {
          const s = String(size);
          const variant = s.includes('Short') ? 'short' : s.includes('Long') ? 'long' : 'medium';
          if (qty > 0) await sellBolster({ quantity: qty as number, variant });
          continue;
        }
        const product = products.find(p => p.size === size);
        if (product && qty > 0) await sellPillow({ productId: product.id, quantity: qty as number });
      }
      // Process parts
      for (const [itemIdStr, qty] of partEntries) {
        const itemId = Number(itemIdStr);
        if (qty > 0) {
          await sellPart({ itemId, quantity: qty as number });
        }
      }
      setCart({ pillows: {}, parts: {} });
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

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-6 space-y-8">
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
              Object.values(cart.pillows).reduce((a, b) => a + b, 0) +
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
          {(() => {
            const available = Number(buildableBolsterMedium ?? 0);
            const disabled = available <= 0;
            return (
              <div
                className={`rounded border p-3 transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40 cursor-pointer'}`}
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                onClick={() => { if (!disabled) incrementPillowSelection('Bolster'); }}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) incrementPillowSelection('Bolster'); }}
              >
                <div className="text-xs text-muted-foreground">Bolster</div>
                <div className="text-2xl font-semibold">{available}</div>
              </div>
            );
          })()}
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

      <Separator />

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
              <div className="font-medium">Custom</div>
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
              {Object.keys(cart.pillows).length === 0 && (
                <div className="text-sm text-muted-foreground">No pillows selected</div>
              )}
              <div className="space-y-2">
                {Object.entries(cart.pillows).map(([size, qty]) => (
                  <div key={size} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <div className="font-medium">Size {size}</div>
                      <div className="text-xs text-muted-foreground">Qty: {qty}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => undoCartLine("pillow", size)}>Undo</Button>
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

      <AddInventoryDrawer
        open={addDrawerOpen}
        onOpenChange={setAddDrawerOpen}
        onCreate={handleCreateItem}
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

function AddInventoryDrawer({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: AddInventoryDraft) => Promise<void>;
}) {
  const [entries, setEntries] = useState<AddInventoryEntry[]>([createDefaultEntry()]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntries([createDefaultEntry()]);
    setErrorMessage(null);
    setSaving(false);
  }, [open]);

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

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
              ? "filling"
              : nextCategory;

        let nextSize: string;
        if (SIZED_CATEGORIES.includes(nextCategory)) {
          const normalized = entry.size.trim().toUpperCase();
          const isValid =
            SIZE_OPTIONS.includes(normalized as typeof SIZE_OPTIONS[number]) && normalized !== "-";
          nextSize = isValid ? normalized : "M";
        } else {
          nextSize = "-";
        }

        const nextSubtype = nextCategory === "filling" ? entry.subtype : "";

        return {
          ...entry,
          category: nextCategory,
          name: trimmedName !== "" ? entry.name : defaultName,
          size: nextSize,
          subtype: nextSubtype,
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
      const trimmedName = entry.name.trim();
      if (!trimmedName) {
        setErrorMessage(`Item ${index + 1}: Name is required`);
        return;
      }

      const trimmedSize = entry.size.trim();
      const normalizedSizeInput = trimmedSize === "-" ? "" : trimmedSize;
      if (SIZED_CATEGORIES.includes(entry.category) && !normalizedSizeInput) {
        setErrorMessage(`Item ${index + 1}: Size is required for this category`);
        return;
      }

      const trimmedSubtype = entry.subtype.trim();
      if (entry.category === "filling" && !trimmedSubtype) {
        setErrorMessage(`Item ${index + 1}: Subtype is required for fillings`);
        return;
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
        payload.size = SIZED_CATEGORIES.includes(entry.category)
          ? normalizedSizeInput.toUpperCase()
          : normalizedSizeInput;
      }

      if (trimmedSubtype) {
        payload.subtype = trimmedSubtype;
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
          <div className="flex-1 space-y-6 overflow-y-auto px-2 pb-6">
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
                  <select
                    id={`add-item-category-${index}`}
                    className={selectClass}
                    value={entry.category}
                    onChange={(event) =>
                      handleCategoryChange(index, event.target.value as ItemCategory)
                    }
                  >
                    {ITEM_CATEGORIES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor={`add-item-name-${index}`}>
                      Variant name
                    </label>
                    <Input
                      id={`add-item-name-${index}`}
                      value={entry.name}
                      onChange={(event) => {
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
                      }}
                      placeholder={
                        entry.category === "packaging"
                          ? "e.g. Tote bag (Premium)"
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
                      <select
                        id={`add-item-size-${index}`}
                        className={selectClass}
                        value={entry.size}
                        onChange={(event) => {
                          const value = event.target.value.toUpperCase();
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
                      >
                        {SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-sm font-medium" htmlFor={`add-item-size-${index}`}>
                        Size <span className="text-xs text-muted-foreground">(optional)</span>
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
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor={`add-item-subtype-${index}`}>
                    {entry.category === "filling" ? "Subtype *" : "Subtype (optional)"}
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
                    placeholder={
                      entry.category === "filling"
                        ? "e.g. 6D (L)"
                        : "Variant or descriptor"
                    }
                    autoComplete="off"
                  />
                </div>
                <Separator />
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
        <div className="mt-4 space-y-3 px-2">
          {sortedVariants.map((variant) => {
            const labelParts = getInventoryItemLabelParts(variant);
            const description = getInventoryItemDisplayLabel(variant);
            const defaultRenameValue = variant.name?.trim() ? variant.name.trim() : labelParts.variant;
            const onHand = balances[variant.id] ?? 0;
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
        <div className="mt-4 space-y-4 px-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="custom-pillow-size">Size</label>
            <select
              id="custom-pillow-size"
              aria-label="Custom pillow size"
              className="rounded border px-2 py-1 text-sm"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            >
              {['XS','S','M','L','XL'].map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
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
        <div className="mt-4 space-y-4 px-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="custom-bolster-variant">Variant</label>
            <select
              id="custom-bolster-variant"
              aria-label="Custom bolster variant"
              className="rounded border px-2 py-1 text-sm"
              value={variant}
              onChange={(e) => setVariant((e.target.value as 'short'|'medium'|'long'))}
            >
              <option value="short">Short (0.8m)</option>
              <option value="medium">Medium (1m)</option>
              <option value="long">Long (1.2m)</option>
            </select>
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
