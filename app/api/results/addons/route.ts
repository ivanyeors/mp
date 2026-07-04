import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accessory add-ons with Costings MSRP.
 * Scoped to the recommended pillow size so we don't list every size variant
 * (e.g. five "Cervical Neck Support" rows). Excludes alteration rows.
 */
export async function GET(req: Request) {
  const size = new URL(req.url).searchParams.get("size")?.trim() || null;
  const admin = supabaseAdmin();

  let query = admin
    .from("items")
    .select("id, name, category, size, subtype, alteration_of_item_id")
    .eq("is_active", true)
    .eq("category", "accessories")
    .is("alteration_of_item_id", null);

  const { data: items, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sized = (items ?? []).filter((i) => {
    if (i.size == null || i.size === "" || i.size === "-") return true;
    if (!size) return true;
    return String(i.size).toUpperCase() === size.toUpperCase();
  });

  const ids = sized.map((i) => i.id);
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

  // One option per display name (prefer exact size match over one-size).
  const byName = new Map<
    string,
    { item_id: number; name: string; msrp: number; currency: string; size: string | null }
  >();
  for (const i of sized) {
    const priced = msrpByItem.get(i.id as number);
    if (!priced) continue;
    const key = String(i.name).trim().toLowerCase();
    const existing = byName.get(key);
    const exactSize =
      size != null && i.size != null && String(i.size).toUpperCase() === size.toUpperCase();
    if (!existing) {
      byName.set(key, {
        item_id: i.id as number,
        name: i.name as string,
        msrp: priced.msrp,
        currency: priced.currency ?? "SGD",
        size: (i.size as string | null) ?? null,
      });
      continue;
    }
    const existingExact =
      size != null &&
      existing.size != null &&
      existing.size.toUpperCase() === size.toUpperCase();
    if (exactSize && !existingExact) {
      byName.set(key, {
        item_id: i.id as number,
        name: i.name as string,
        msrp: priced.msrp,
        currency: priced.currency ?? "SGD",
        size: (i.size as string | null) ?? null,
      });
    }
  }

  const addons = [...byName.values()].map(({ item_id, name, msrp, currency }) => ({
    item_id,
    name,
    msrp,
    currency,
  }));

  return NextResponse.json({ addons });
}
