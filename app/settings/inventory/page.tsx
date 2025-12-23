"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sellPillow, sellPart, receiveStock, sellBolster } from "./actions";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Item = { id: number; category: string; subtype: string | null; name: string; size: string | null };
type Product = { id: number; size: string };

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [buildable, setBuildable] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [partDrawerOpen, setPartDrawerOpen] = useState(false);
  const [partDrawerGroup, setPartDrawerGroup] = useState<{ title: string; variants: Item[] } | null>(null);
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

  const load = async () => {
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
  };

  useEffect(() => { load(); }, []);

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

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  type Group = { key: string; title: string; items: Item[] };
  const partGroups = useMemo(() => {
    const groups: Group[] = [];
    // Bolster-only parts
    const bolsterCase = items.filter(i => i.category === 'case' && i.size === 'Bolster');
    if (bolsterCase.length) groups.push({ key: 'bolster:case', title: 'Bolster case', items: bolsterCase });
    const bolsterProtector = items.filter(i => i.category === 'protector' && i.size === 'Bolster');
    if (bolsterProtector.length) groups.push({ key: 'bolster:protector', title: 'Bolster protector', items: bolsterProtector });
    // Sized categories grouped by category
    const sizedCats = ["cover", "case", "protector"] as const;
    for (const cat of sizedCats) {
      let groupItems = items.filter(i => i.category === cat);
      let title = capitalize(cat);
      if (cat === 'case') {
        // Exclude bolster cases from the Pillow Case group; they have their own card
        groupItems = groupItems.filter(i => i.size !== 'Bolster');
        title = 'Pillow Case';
      } else if (cat === 'protector') {
        // Exclude bolster protectors from the Pillow protector group; they have their own card
        groupItems = groupItems.filter(i => i.size !== 'Bolster');
        title = 'Pillow protector';
      }
      if (groupItems.length) groups.push({ key: `cat:${cat}`, title, items: groupItems });
    }
    // Fillings consolidated into a single card
    const fillings = items.filter(i => i.category === 'filling');
    if (fillings.length) {
      groups.push({ key: 'filling:all', title: 'Fillings', items: fillings });
    }
    // Packaging grouped by name
    const pkgs = items.filter(i => i.category === 'packaging');
    const pkgMap = new Map<string, Item[]>();
    for (const it of pkgs) {
      const key = it.name;
      const arr = pkgMap.get(key) ?? [];
      arr.push(it); pkgMap.set(key, arr);
    }
    for (const [k, arr] of pkgMap.entries()) {
      groups.push({ key: `pack:${k}`, title: k, items: arr });
    }
    return groups;
  }, [items]);

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
            onClick={() => { setPartDrawerGroup({ title: 'Custom parts', variants: items }); setPartDrawerOpen(true); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setPartDrawerGroup({ title: 'Custom parts', variants: items }); setPartDrawerOpen(true); } }}
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
                onClick={() => { setPartDrawerGroup({ title: group.title, variants: group.items }); setPartDrawerOpen(true); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setPartDrawerGroup({ title: group.title, variants: group.items }); setPartDrawerOpen(true); } }}
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
              <li key={it.id}>{it.category} {it.size ?? it.subtype ?? ''} — {balances[it.id] ?? 0}</li>
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
                        <div className="font-medium">{it?.category} {it?.size ?? it?.subtype ?? ''}</div>
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

function PartDrawer({ open, onOpenChange, group, balances, onReceive, onSell, onSelectVariant }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { title: string; variants: Item[] } | null;
  balances: Record<number, number>;
  onReceive: (itemId: number, qty: number) => Promise<void>;
  onSell: (itemId: number, qty: number) => Promise<void>;
  onSelectVariant: (itemId: number) => void;
}) {
  const [qtyByItem, setQtyByItem] = useState<Record<number, string>>({});
  const [outQtyByItem, setOutQtyByItem] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const sortedVariants = useMemo(() => {
    const list: Item[] = group?.variants ?? [];
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
          {sortedVariants.map(v => (
            <div key={v.id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{
                    v.category === 'filling'
                      ? `${(v.subtype ?? v.name ?? 'Filling')}${v.size ? `-${v.size}` : ''}`
                      : v.category === 'case'
                        ? `Pillow Case${v.size ? ` — ${v.size}` : ''}`
                        : v.category === 'protector'
                          ? `Pillow protector${v.size ? ` — ${v.size}` : ''}`
                          : `${(v.name ?? v.category)}${v.size ? ` — ${v.size}` : ''}`
                  }</div>
                  <div className="text-xs text-muted-foreground">On hand: {balances[v.id] ?? 0}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onSelectVariant(v.id)}>Add</Button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Input
                  type="number"
                  placeholder="In"
                  min={0}
                  value={qtyByItem[v.id] ?? ''}
                  onChange={(e) => setQtyByItem(prev => ({ ...prev, [v.id]: e.target.value }))}
                  className="w-28"
                />
                <Input
                  type="number"
                  placeholder="Out"
                  min={0}
                  value={outQtyByItem[v.id] ?? ''}
                  onChange={(e) => setOutQtyByItem(prev => ({ ...prev, [v.id]: e.target.value }))}
                  className="w-28"
                />
              </div>
            </div>
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
                  <TableHead>Part</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('cover').map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">Cover</TableCell>
                    <TableCell>{size}</TableCell>
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
                  <TableHead>Part</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('case').map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">Pillow Case</TableCell>
                    <TableCell>{size}</TableCell>
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
                  <TableHead>Part</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('protector').map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">Pillow protector</TableCell>
                    <TableCell>{size}</TableCell>
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
                  <TableHead>Subtype</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fillings.map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.subtype ?? it.name}</TableCell>
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
                  <TableHead>Size</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packaging.map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell>{it.size}</TableCell>
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
                  <TableHead>Part</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('case').map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">Bolster Case</TableCell>
                    <TableCell>Bolster</TableCell>
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
                  <TableHead>Part</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sized('protector').map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">Bolster protector</TableCell>
                    <TableCell>Bolster</TableCell>
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
                  <TableHead>Subtype</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fillings.map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.subtype ?? it.name}</TableCell>
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
                  <TableHead>Size</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packaging.map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell>{it.size}</TableCell>
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
