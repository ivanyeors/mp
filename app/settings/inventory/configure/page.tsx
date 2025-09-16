"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

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
    alert("Saved");
  };

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Configure Pillow BOM</h1>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
      <Separator />
      {SIZES.map((size) => (
        <SizeEditor
          key={size}
          size={size}
          items={items}
          bom={bom}
          setBom={setBom}
        />
      ))}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Section title="Cover (1)">
          {sized('cover').map(it => (
            <QtyRow key={it.id} label={`Cover ${size}`} value={getQty(it.id)} onChange={(v)=> upsert(it.id, v)} />
          ))}
        </Section>
        <Section title="Case (1)">
          {sized('case').map(it => (
            <QtyRow key={it.id} label={`Case ${size}`} value={getQty(it.id)} onChange={(v)=> upsert(it.id, v)} />
          ))}
        </Section>
        <Section title="Protector (1)">
          {sized('protector').map(it => (
            <QtyRow key={it.id} label={`Protector ${size}`} value={getQty(it.id)} onChange={(v)=> upsert(it.id, v)} />
          ))}
        </Section>
      </div>
      <Section title="Fillings">
        {fillings.map(it => (
          <QtyRow key={it.id} label={it.subtype ?? it.name} value={getQty(it.id)} onChange={(v)=> v===0? remove(it.id) : upsert(it.id, v)} />
        ))}
      </Section>
      <Section title="Packaging (1 vacuum + 1 net)">
        {packaging.map(it => (
          <QtyRow key={it.id} label={`${it.name} ${it.size}`} value={getQty(it.id)} onChange={(v)=> upsert(it.id, v)} />
        ))}
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
