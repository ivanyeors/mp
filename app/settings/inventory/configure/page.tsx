"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

type Item = {
  id: number;
  category: "cover" | "case" | "protector" | "filling" | "packaging" | "accessories" | "other";
  subtype: string | null;
  name: string;
  size: string | null;
};

type Product = { id: number; size: "XS" | "S" | "M" | "L" | "XL" };

type BomLine = { item_id: number; quantity: number };

type BomState = Record<Product["size"], BomLine[]>;

const SIZES: Product["size"][] = ["XS", "S", "M", "L", "XL"];
const KNOWN_CATEGORIES: Item["category"][] = ["cover", "case", "protector", "filling", "packaging", "accessories", "other"];

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

export default function ConfigureInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bom, setBom] = useState<BomState>({ XS: [], S: [], M: [], L: [], XL: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Product["size"] | null>(null);
  const [bolsterOpen, setBolsterOpen] = useState(false);
  const [bolsterVariant, setBolsterVariant] = useState<'Short (0.8m)' | 'Medium (1m)' | 'Long (1.2m)' | null>(null);
  const [bolsterLines, setBolsterLines] = useState<BomLine[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: itemsData }, { data: productsData }, { data: bomData }] = await Promise.all([
        supabaseClient.from("items").select("id,category,subtype,name,size").eq("is_active", true),
        supabaseClient.from("pillow_products").select("id,size").eq("is_active", true),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
      ]);
      setItems(itemsData ?? []);
      setProducts((productsData ?? []) as Product[]);
      const next: BomState = { XS: [], S: [], M: [], L: [], XL: [] };
      type BomRow = { product_id: number; item_id: number; quantity: number | string };
      const prods = (productsData ?? []) as Product[];
      (bomData ?? []).forEach((row: BomRow) => {
        const product = prods.find((p) => p.id === row.product_id);
        if (!product) return;
        next[product.size as Product["size"]].push({ item_id: row.item_id, quantity: Number(row.quantity) });
      });
      setBom(next);
      setLoading(false);
    };
    load();
  }, []);

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

  // removed unused itemsBy

  const buildPayloadLines = (lines: BomLine[]) =>
    lines
      .map((line) => {
        const quantity = Number.isFinite(line.quantity) ? Math.max(0, Math.round(line.quantity)) : 0;
        return { item_id: line.item_id, quantity };
      })
      .filter((line) => line.quantity > 0);

  const persistProductBom = async (productId: number, lines: BomLine[]) => {
    const payloadLines = buildPayloadLines(lines);
    const response = await fetch("/settings/inventory/configure/save", {
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

  const save = async () => {
    if (products.length === 0) {
      toast.message("No active pillow products to save");
      return;
    }
    setSaving(true);
    try {
      for (const product of products) {
        await persistProductBom(product.id, bom[product.size]);
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
      const response = await fetch('/settings/inventory/configure/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bolster', variant, lines }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? 'Failed to save bolster';
        throw new Error(message);
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`bolster_bom_lines:${variant}`, JSON.stringify(lines));
      }
      toast.success('Bolster configuration saved');
      setBolsterOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save bolster';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveSize = async (size: Product["size"]) => {
    setSaving(true);
    try {
      const product = products.find((p) => p.size === size);
      if (!product) {
        throw new Error(`No active pillow product found for size ${size}`);
      }
      await persistProductBom(product.id, bom[size]);
      toast.success(`Configuration saved for size ${size}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Configure Mpillow</h1>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
      <Separator />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {SIZES.map((size) => {
          const partsCount = bom[size].filter(l => (l.quantity ?? 0) > 0).length;
          return (
            <div
              key={size}
              role="button"
              tabIndex={0}
              onClick={()=> { setSelectedSize(size); setOpen(true); }}
              onKeyDown={(e)=> { if (e.key==='Enter' || e.key===' ') { setSelectedSize(size); setOpen(true); } }}
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

      <Separator />
      <div className="space-y-2">
        <div className="text-2xl font-semibold">Configure Mbolster</div>
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Configure Size {selectedSize ?? ''}</SheetTitle>
            <SheetDescription>Adjust BOM quantities and save for this pillow size.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-2">
            {selectedSize && (
              <SizeEditor
                size={selectedSize}
                items={items}
                bom={bom}
                setBom={setBom}
              />
            )}
          </div>
          <SheetFooter>
            <Button onClick={() => { if (selectedSize) saveSize(selectedSize); }} disabled={saving}>
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
          <div className="mt-4 space-y-4 px-2">
            <BolsterEditor items={items} lines={bolsterLines} setLines={setBolsterLines} />
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
        title="Case"
        sizeLabel={size}
        lines={linesForCategory("case")}
        availableItems={sized("case")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Protector"
        sizeLabel={size}
        lines={linesForCategory("protector")}
        availableItems={sized("protector")}
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
        variantResolver={(item) => normalizeNameOrFallback(item.subtype ?? item.name, "filling")}
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
}: DynamicPartSectionProps) {
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number>(1);

  const existingIds = useMemo(() => new Set(lines.map((l) => l.item_id)), [lines]);
  const addable = availableItems.filter((i) => !existingIds.has(i.id));

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
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={selectedId === "" ? "" : String(selectedId)}
                onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
                disabled={addable.length === 0}
              >
                <option value="">{addable.length ? "Select part to add" : "All available parts added"}</option>
                {addable.map((it) => (
                  <option key={it.id} value={it.id}>
                    {getItemBaseName(it)}
                  </option>
                ))}
              </select>
            </div>
          </TableCell>
          <TableCell className="w-[140px]">
            <Input
              type="number"
              min={0}
              value={quantity}
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

function BolsterEditor({ items, lines, setLines }: { items: Item[]; lines: BomLine[]; setLines: Dispatch<SetStateAction<BomLine[]>> }) {
  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const sized = (category: Item["category"]) => items.filter((i) => i.category === category && i.size === "Bolster");
  const fillings = items.filter((i) => i.category === "filling" && i.subtype === "6D (L)");
  const packaging = items.filter((i) => i.category === "packaging" && i.size === "S");
  const accessories = items.filter((i) => i.category === "accessories" && (!i.size || i.size === "Bolster"));
  const other = items.filter((i) => i.category === "other" && (!i.size || i.size === "Bolster"));

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
        title="Case (Bolster)"
        sizeLabel="Bolster"
        lines={linesForCategory("case")}
        availableItems={sized("case")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Protector (Bolster)"
        sizeLabel="Bolster"
        lines={linesForCategory("protector")}
        availableItems={sized("protector")}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Fillings – 6D (L)"
        sizeLabel="Bolster"
        lines={linesForCategory("filling")}
        availableItems={fillings}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
        variantResolver={(item) => normalizeNameOrFallback(item.subtype ?? item.name, "filling")}
      />

      <DynamicPartSection
        title="Packaging (typical)"
        sizeLabel="Bolster"
        lines={linesForCategory("packaging")}
        availableItems={packaging}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Accessories"
        sizeLabel="Bolster"
        lines={linesForCategory("accessories")}
        availableItems={accessories}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      <DynamicPartSection
        title="Other"
        sizeLabel="Bolster"
        lines={linesForCategory("other")}
        availableItems={other}
        getItem={(id) => itemsById.get(id)}
        upsert={upsert}
        remove={remove}
      />

      {uncategorizedLines.length > 0 && (
        <DynamicPartSection
          title="Uncategorized"
          sizeLabel="Bolster"
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
