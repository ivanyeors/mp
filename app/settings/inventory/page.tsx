"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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

  const load = async () => {
    setLoading(true);
    const [{ data: itemsData }, { data: balancesData }, { data: productsData }, { data: buildableData }] = await Promise.all([
      supabaseClient.from("items").select("id,category,subtype,name,size"),
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
      const groupItems = items.filter(i => i.category === cat);
      if (groupItems.length) groups.push({ key: `cat:${cat}`, title: capitalize(cat), items: groupItems });
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

  const sellCustomPillow = async () => {
    const qty = parseInt((customPillowQty || '0'), 10);
    if (!qty || qty <= 0) { toast.message('Enter a quantity > 0'); return; }
    const product = products.find(p => p.size === customPillowSize);
    if (!product) { toast.error('Invalid size'); return; }
    setSavingCustomPillow(true);
    try {
      await sellPillow({ productId: product.id, quantity: qty });
      setCustomPillowQty('');
      await load();
      toast.success('Custom pillow sold');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to sell pillow';
      toast.error(message);
    } finally {
      setSavingCustomPillow(false);
    }
  };

  const sellCustomBolster = async () => {
    const qty = parseInt((customBolsterQty || '0'), 10);
    if (!qty || qty <= 0) { toast.message('Enter a quantity > 0'); return; }
    setSavingCustomBolster(true);
    try {
      await sellBolster({ quantity: qty, variant: customBolsterVariant });
      setCustomBolsterQty('');
      await load();
      toast.success('Custom bolster sold');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to sell bolster';
      toast.error(message);
    } finally {
      setSavingCustomBolster(false);
    }
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
          {['XS','S','M','L','XL'].map(sz => (
            <div
              key={sz}
              className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => incrementPillowSelection(sz)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') incrementPillowSelection(sz); }}
            >
              <div className="text-xs text-muted-foreground">{sz}</div>
              <div className="text-2xl font-semibold">{buildable[sz] ?? 0}</div>
            </div>
          ))}
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => incrementPillowSelection('Bolster')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') incrementPillowSelection('Bolster'); }}
          >
            <div className="text-xs text-muted-foreground">Bolster</div>
            <div className="text-2xl font-semibold">{buildableBolsterMedium}</div>
          </div>
          {/* Custom Pillow */}
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Custom</div>
            <div className="mt-2 flex items-center gap-2">
              <select
                aria-label="Custom pillow size"
                className="rounded border px-2 py-1 text-sm"
                value={customPillowSize}
                onChange={(e) => setCustomPillowSize(e.target.value)}
              >
                {['XS','S','M','L','XL'].map(s => (<option key={s} value={s}>{s}</option>))}
              </select>
              <Input
                type="number"
                min={0}
                placeholder="Qty"
                value={customPillowQty}
                onChange={(e) => setCustomPillowQty(e.target.value)}
                className="w-24"
              />
            </div>
            <div className="mt-2">
              <Button size="sm" className="w-full" onClick={sellCustomPillow} disabled={savingCustomPillow}>
                {savingCustomPillow ? 'Selling…' : 'Sell'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Bolster variants */}
      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Select bolsters</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => incrementPillowSelection('Bolster Short (0.8m)')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') incrementPillowSelection('Bolster Short (0.8m)'); }}
          >
            <div className="text-xs text-muted-foreground">Bolster</div>
            <div className="text-2xl font-semibold">{buildableBolsterShort}</div>
            <div className="mt-1 text-xs text-muted-foreground">Short (0.8m)</div>
          </div>
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => incrementPillowSelection('Bolster Medium (1m)')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') incrementPillowSelection('Bolster Medium (1m)'); }}
          >
            <div className="text-xs text-muted-foreground">Bolster</div>
            <div className="text-2xl font-semibold">{buildableBolsterMedium}</div>
            <div className="mt-1 text-xs text-muted-foreground">Medium (1m)</div>
          </div>
          <div
            className="rounded border p-3 hover:bg-muted/40 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => incrementPillowSelection('Bolster Long (1.2m)')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') incrementPillowSelection('Bolster Long (1.2m)'); }}
          >
            <div className="text-xs text-muted-foreground">Bolster</div>
            <div className="text-2xl font-semibold">{buildableBolsterLong}</div>
            <div className="mt-1 text-xs text-muted-foreground">Long (1.2m)</div>
          </div>
          {/* Custom Bolster */}
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Custom bolster</div>
            <div className="mt-2 flex items-center gap-2">
              <select
                aria-label="Custom bolster variant"
                className="rounded border px-2 py-1 text-sm"
                value={customBolsterVariant}
                onChange={(e) => setCustomBolsterVariant((e.target.value as 'short'|'medium'|'long'))}
              >
                <option value="short">Short (0.8m)</option>
                <option value="medium">Medium (1m)</option>
                <option value="long">Long (1.2m)</option>
              </select>
              <Input
                type="number"
                min={0}
                placeholder="Qty"
                value={customBolsterQty}
                onChange={(e) => setCustomBolsterQty(e.target.value)}
                className="w-24"
              />
            </div>
            <div className="mt-2">
              <Button size="sm" className="w-full" onClick={sellCustomBolster} disabled={savingCustomBolster}>
                {savingCustomBolster ? 'Selling…' : 'Sell'}
              </Button>
            </div>
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
            <div>
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
            <div>
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
        onSelectVariant={(id) => incrementPartSelection(id)}
      />
    </div>
  );
}

function PartDrawer({ open, onOpenChange, group, balances, onReceive, onSelectVariant }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { title: string; variants: Item[] } | null;
  balances: Record<number, number>;
  onReceive: (itemId: number, qty: number) => Promise<void>;
  onSelectVariant: (itemId: number) => void;
}) {
  const [qtyByItem, setQtyByItem] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const sortedVariants = useMemo(() => {
    const list: Item[] = group?.variants ?? [];
    if (!group) return list;
    if (group.title !== 'Fillings') return list;
    const typeOrder = (t: string) => (t === '3D' ? 0 : t === '6D' ? 1 : 2);
    const sizeOrder = (s: string) => (s === 'S' ? 0 : s === 'L' ? 1 : s === 'L+' ? 2 : 3);
    return [...list].sort((a, b) => {
      const ta = String(a.subtype ?? a.name ?? '');
      const tb = String(b.subtype ?? b.name ?? '');
      const sa = String(a.size ?? '');
      const sb = String(b.size ?? '');
      const to = typeOrder(ta) - typeOrder(tb);
      if (to !== 0) return to;
      return sizeOrder(sa) - sizeOrder(sb);
    });
  }, [group]);

  const onSaveAll = async () => {
    const entries = Object.entries(qtyByItem)
      .map(([id, raw]) => ({ id: Number(id), qty: parseInt((raw || '0'), 10) }))
      .filter(e => e.qty > 0);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      for (const e of entries) {
        await onReceive(e.id, e.qty);
      }
      setQtyByItem({});
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const onSaveAndAnother = async () => {
    const entries = Object.entries(qtyByItem)
      .map(([id, raw]) => ({ id: Number(id), qty: parseInt((raw || '0'), 10) }))
      .filter(e => e.qty > 0);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      for (const e of entries) {
        await onReceive(e.id, e.qty);
      }
      // Reset inputs but keep drawer open
      setQtyByItem({});
    } finally {
      setSaving(false);
    }
  };

  const hasPositive = Object.values(qtyByItem).some(v => (parseInt((v || '0'), 10) > 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{group?.title ?? 'Part'}</SheetTitle>
          <SheetDescription>Stock in quantities for specific sizes or variants.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-2">
          {sortedVariants.map(v => (
            <div key={v.id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{
                    v.category === 'filling'
                      ? `${(v.subtype ?? v.name ?? 'Filling')}${v.size ? `-${v.size}` : ''}`
                      : `${(v.name ?? v.category)}${v.size ? ` — ${v.size}` : ''}`
                  }</div>
                  <div className="text-xs text-muted-foreground">On hand: {balances[v.id] ?? 0}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onSelectVariant(v.id)}>Select</Button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Stockin"
                  min={0}
                  value={qtyByItem[v.id] ?? ''}
                  onChange={(e) => setQtyByItem(prev => ({ ...prev, [v.id]: e.target.value }))}
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
            <Button onClick={onSaveAndAnother} disabled={!hasPositive || saving} variant="secondary" className="flex-1">
              {saving ? 'Saving…' : 'Add another'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
