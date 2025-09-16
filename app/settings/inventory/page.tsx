"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { sellPillow, sellPart, receiveStock } from "./actions";

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [buildable, setBuildable] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: itemsData }, { data: balancesData }, { data: productsData }, { data: buildableData }] = await Promise.all([
      supabaseClient.from("items").select("id,category,subtype,name,size"),
      supabaseClient.from("inventory_balances").select("item_id,on_hand"),
      supabaseClient.from("pillow_products").select("id,size"),
      supabaseClient.from("product_buildable").select("product_id,size,buildable"),
    ]);
    setItems(itemsData ?? []);
    setBalances(Object.fromEntries((balancesData ?? []).map((r: any)=> [r.item_id, Number(r.on_hand)] )));
    setProducts(productsData ?? []);
    const build = Object.fromEntries((buildableData ?? []).map((r: any)=> [r.size, Number(r.buildable)] ));
    setBuildable(build);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const lowStock = useMemo(() => {
    return items.filter(i => (balances[i.id] ?? 0) <= 0);
  }, [items, balances]);

  const onSellPillow = async (size: string, qty: number) => {
    const product = products.find(p => p.size===size);
    if (!product) return alert('Product not found');
    await sellPillow({ productId: product.id, quantity: qty });
    await load();
  };

  const onSellPart = async (itemId: number, qty: number) => {
    await sellPart({ itemId, quantity: qty });
    await load();
  };

  const onReceive = async (itemId: number, qty: number) => {
    await receiveStock({ itemId, quantity: qty });
    await load();
  };

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </div>

      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Buildable pillows by size</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {['XS','S','M','L','XL'].map(sz => (
            <div key={sz} className="rounded border p-3">
              <div className="text-xs text-muted-foreground">{sz}</div>
              <div className="text-2xl font-semibold">{buildable[sz] ?? 0}</div>
              <div className="mt-2 flex gap-2">
                <QtyButton label="Sell 1" onClick={()=> onSellPillow(sz, 1)} />
                <QtyButton label="Sell 5" onClick={()=> onSellPillow(sz, 5)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-2">
        <div className="text-sm text-muted-foreground">Parts stock</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(it => (
            <div key={it.id} className="rounded border p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">{it.category} {it.size ?? it.subtype ?? ''}</div>
                <div className="text-xs text-muted-foreground">On hand: {balances[it.id] ?? 0}</div>
              </div>
              <QtyInput label="Sell" onSubmit={(q)=> onSellPart(it.id, q)} />
              <QtyInput label="Receive" onSubmit={(q)=> onReceive(it.id, q)} />
            </div>
          ))}
        </div>
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
    </div>
  );
}

function QtyButton({ label, onClick }: { label: string; onClick: ()=>void }) {
  return <Button size="sm" onClick={onClick}>{label}</Button>
}

function QtyInput({ label, onSubmit }: { label: string; onSubmit: (qty:number)=>void }) {
  const [val, setVal] = useState('');
  return (
    <div className="flex items-center gap-2">
      <Input value={val} onChange={(e)=> setVal(e.target.value)} placeholder={label} className="w-20" />
      <Button size="sm" variant="secondary" onClick={()=> { const q = parseInt(val||'0',10); if (q>0) onSubmit(q); setVal(''); }}>Go</Button>
    </div>
  );
}
