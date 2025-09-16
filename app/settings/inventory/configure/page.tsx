"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

type Item = {
  id: number;
  category: "cover" | "case" | "protector" | "filling" | "packaging";
  subtype: string | null;
  name: string;
  size: string | null;
};

type Product = { id: number; size: "XS" | "S" | "M" | "L" | "XL" };

type BomLine = { item_id: number; quantity: number };

type BomState = Record<Product["size"], BomLine[]>;

const SIZES: Product["size"][] = ["XS", "S", "M", "L", "XL"];

export default function ConfigureInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bom, setBom] = useState<BomState>({ XS: [], S: [], M: [], L: [], XL: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Product["size"] | null>(null);
  const [bolsterOpen, setBolsterOpen] = useState(false);
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
      setProducts((productsData as any) ?? []);
      const next: BomState = { XS: [], S: [], M: [], L: [], XL: [] };
      (bomData ?? []).forEach((row: any) => {
        const product = (productsData as any)?.find((p: any) => p.id === row.product_id);
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
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('bolster_bom_lines') : null;
      if (raw) {
        const parsed = JSON.parse(raw) as BomLine[];
        setBolsterLines(Array.isArray(parsed) ? parsed : []);
      }
    } catch {}
  }, []);

  const itemsBy = useMemo(() => {
    const by: Record<string, Item[]> = {};
    for (const it of items) {
      const key = `${it.category}:${it.size ?? it.subtype ?? "_"}`;
      if (!by[key]) by[key] = [];
      by[key].push(it);
    }
    return by;
  }, [items]);

  const save = async () => {
    setSaving(true);
    const { data: productsData } = await supabaseClient.from("pillow_products").select("id,size");
    for (const p of (productsData ?? []) as Product[]) {
      const lines = bom[p.size];
      await fetch("/settings/inventory/configure/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, lines }),
      });
    }
    setSaving(false);
    toast.success("Configuration saved for all sizes");
  };

  const saveBolster = async () => {
    try {
      const lines = (bolsterLines ?? []).filter(l => (l.quantity ?? 0) > 0);
      await fetch('/settings/inventory/configure/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bolster', lines }),
      });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bolster_bom_lines', JSON.stringify(lines));
      }
      toast.success('Bolster configuration saved');
      setBolsterOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save bolster');
    }
  };

  const saveSize = async (size: Product["size"]) => {
    setSaving(true);
    const product = products.find(p => p.size === size);
    if (!product) { setSaving(false); return; }
    const lines = bom[size];
    await fetch("/settings/inventory/configure/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, lines }),
    });
    setSaving(false);
    toast.success(`Configuration saved for size ${size}`);
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
        <div className="text-sm text-muted-foreground">Configure Mbolster</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={()=> { setBolsterOpen(true); }}
            onKeyDown={(e)=> { if (e.key==='Enter' || e.key===' ') { setBolsterOpen(true); } }}
            className="rounded-lg border p-4 hover:bg-muted/50 cursor-pointer select-none"
          >
            <div className="text-xs text-muted-foreground">Bolster</div>
            <div className="text-2xl font-semibold">Standard</div>
            <div className="mt-2 text-xs text-muted-foreground">Case, Protector, 6D-L</div>
            <div className="mt-3">
              <Button size="sm" variant="secondary">Configure</Button>
            </div>
          </div>
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
            <SheetTitle>Configure Bolster</SheetTitle>
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

function SizeEditor({ size, items, bom, setBom }: { size: Product["size"]; items: Item[]; bom: BomState; setBom: (updater: any) => void }) {
  const sized = (category: Item["category"]) => items.filter(i => i.category===category && i.size===size);
  const fillings = items.filter(i => i.category==='filling');
  const packaging = items.filter(i => i.category==='packaging' && ((size==='XS'||size==='S'||size==='M') ? i.size==='S' : i.size==='L'));
  const lines = bom[size];

  const upsert = (item_id: number, quantity: number) => {
    setBom((prev: BomState) => {
      const copy = { ...prev } as BomState;
      const idx = copy[size].findIndex(l => l.item_id===item_id);
      if (idx === -1) copy[size] = [...copy[size], { item_id, quantity }];
      else copy[size] = copy[size].map((l) => l.item_id===item_id ? { ...l, quantity } : l);
      return copy;
    });
  };

  const remove = (item_id: number) => {
    setBom((prev: BomState) => ({ ...prev, [size]: prev[size].filter(l => l.item_id!==item_id) }));
  };

  const getQty = (item_id: number) => lines.find(l=>l.item_id===item_id)?.quantity ?? 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Size {size}</h2>
      <Section title="Cover (1)">
        <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]}>
          {sized('cover').map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">Cover</TableCell>
              <TableCell>{size}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>
      <Section title="Case (1)">
        <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]}>
          {sized('case').map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">Case</TableCell>
              <TableCell>{size}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>
      <Section title="Protector (1)">
        <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]}>
          {sized('protector').map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">Protector</TableCell>
              <TableCell>{size}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>

      <Section title="Fillings">
        <ConfigureTable headers={["Subtype", "Qty", "Actions"]}>
          {fillings.map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.subtype ?? it.name}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> {
                    const v = Math.max(0, parseInt(e.target.value||'0',10));
                    if (v===0) remove(it.id); else upsert(it.id, v);
                  }} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> remove(it.id)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>

      <Section title="Packaging (1 vacuum + 1 net)">
        <ConfigureTable headers={["Item", "Size", "Qty", "Actions"]}>
          {packaging.map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.name}</TableCell>
              <TableCell>{it.size}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>
      <Separator />
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function QtyRow({ label, value, onChange }: { label: string; value: number; onChange: (v:number)=>void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">{label}</div>
      <Input type="number" min={0} value={value}
        onChange={(e)=> onChange(Math.max(0, parseInt(e.target.value||'0',10)))}
        className="w-24" />
      <Button variant="secondary" onClick={()=> onChange(0)}>Clear</Button>
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

function BolsterEditor({ items, lines, setLines }: { items: Item[]; lines: BomLine[]; setLines: (updater: any) => void }) {
  const sized = (category: Item["category"]) => items.filter(i => i.category===category && (i.size==='Bolster'));
  const fillings = items.filter(i => i.category==='filling' && i.subtype==='6D-L');
  const packaging = items.filter(i => i.category==='packaging' && i.size==='S');

  const upsert = (item_id: number, quantity: number) => {
    setLines((prev: BomLine[]) => {
      const idx = prev.findIndex(l => l.item_id===item_id);
      if (idx === -1) return [...prev, { item_id, quantity }];
      return prev.map((l) => l.item_id===item_id ? { ...l, quantity } : l);
    });
  };

  const remove = (item_id: number) => {
    setLines((prev: BomLine[]) => prev.filter(l => l.item_id!==item_id));
  };

  const getQty = (item_id: number) => lines.find(l=>l.item_id===item_id)?.quantity ?? 0;

  return (
    <div className="space-y-4">
      <Section title="Case (Bolster)">
        <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]}>
          {sized('case').map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">Case</TableCell>
              <TableCell>Bolster</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>

      <Section title="Protector (Bolster)">
        <ConfigureTable headers={["Part", "Variant", "Qty", "Actions"]}>
          {sized('protector').map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">Protector</TableCell>
              <TableCell>Bolster</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>

      <Section title="Fillings (6D-L)">
        <ConfigureTable headers={["Subtype", "Qty", "Actions"]}>
          {fillings.map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.subtype ?? it.name}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> {
                    const v = Math.max(0, parseInt(e.target.value||'0',10));
                    if (v===0) remove(it.id); else upsert(it.id, v);
                  }} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> remove(it.id)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>

      <Section title="Packaging (1 vacuum + 1 net typical)">
        <ConfigureTable headers={["Item", "Size", "Qty", "Actions"]}>
          {packaging.map(it => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.name}</TableCell>
              <TableCell>{it.size}</TableCell>
              <TableCell className="w-[140px]">
                <Input type="number" min={0} value={getQty(it.id)}
                  onChange={(e)=> upsert(it.id, Math.max(0, parseInt(e.target.value||'0',10)))} />
              </TableCell>
              <TableCell className="w-[110px]"><Button size="sm" variant="secondary" onClick={()=> upsert(it.id, 0)}>Clear</Button></TableCell>
            </TableRow>
          ))}
        </ConfigureTable>
      </Section>
      <Separator />
    </div>
  );
}
