import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accessory add-ons with Costings MSRP (no fillings/protectors). */
export async function GET() {
  const admin = supabaseAdmin();
  const { data: items, error } = await admin
    .from("items")
    .select("id, name, category")
    .eq("is_active", true)
    .eq("category", "accessories");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (items ?? []).map((i) => i.id);
  if (ids.length === 0) return NextResponse.json({ addons: [] });

  const { data: prices } = await admin
    .from("item_prices")
    .select("item_id, msrp, currency")
    .in("item_id", ids);

  const msrpByItem = new Map(
    (prices ?? [])
      .filter((p) => p.msrp != null)
      .map((p) => [p.item_id as number, { msrp: Number(p.msrp), currency: p.currency as string }]),
  );

  const addons = (items ?? [])
    .filter((i) => msrpByItem.has(i.id))
    .map((i) => ({
      item_id: i.id as number,
      name: i.name as string,
      msrp: msrpByItem.get(i.id)!.msrp,
      currency: msrpByItem.get(i.id)!.currency ?? "SGD",
    }));

  return NextResponse.json({ addons });
}
