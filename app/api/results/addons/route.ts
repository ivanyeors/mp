import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  BOLSTER_LENGTHS,
  PILLOW_SIZES,
  suggestAddons,
  type AddonProductType,
} from "@/lib/results/addons";
import { resolveAddonImageUrls, type AddonMediaAsset } from "@/lib/results/addon-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accessory add-ons with Costings MSRP, scoped to product type + size/length.
 * Pillow: size-matched accessories (and one-size). Bolster: BOLSTER / length / S–L only.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const productTypeParam = url.searchParams.get("productType")?.trim().toLowerCase();
  const productType: AddonProductType =
    productTypeParam === "bolster" ? "bolster" : "pillow";

  const sizeKeyRaw =
    url.searchParams.get("size")?.trim() ||
    url.searchParams.get("length")?.trim() ||
    null;

  let sizeKey = sizeKeyRaw;
  if (productType === "pillow" && sizeKey) {
    const upper = sizeKey.toUpperCase();
    sizeKey = (PILLOW_SIZES as readonly string[]).includes(upper) ? upper : sizeKey;
  }
  if (productType === "bolster" && sizeKey) {
    const lower = sizeKey.toLowerCase();
    sizeKey = (BOLSTER_LENGTHS as readonly string[]).includes(lower) ? lower : sizeKey;
  }

  const admin = supabaseAdmin();
  const { data: items, error } = await admin
    .from("items")
    .select("id, name, category, size, subtype, alteration_of_item_id, primary_media_asset_id")
    .eq("is_active", true)
    .eq("category", "accessories")
    .is("alteration_of_item_id", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (items ?? []).map((i) => ({
    id: i.id as number,
    name: String(i.name),
    size: (i.size as string | null) ?? null,
    subtype: (i.subtype as string | null) ?? null,
  }));

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return NextResponse.json({ addons: [], productType, sizeKey });
  }

  // Add-on card imagery from the Item's primary Media Asset (slice 12).
  const mediaRefs = (items ?? []).map((i) => ({
    id: i.id as number,
    primary_media_asset_id: (i.primary_media_asset_id as string | null) ?? null,
  }));
  const assetIds = [
    ...new Set(
      mediaRefs.map((r) => r.primary_media_asset_id).filter((v): v is string => Boolean(v)),
    ),
  ];

  // Prices and asset imagery both depend only on the items query, so fetch both at once.
  const [pricesResult, assetsResult] = await Promise.all([
    admin.from("item_prices").select("item_id, msrp, currency").in("item_id", ids),
    assetIds.length > 0
      ? admin.from("media_assets").select("id, kind, hosted_url").in("id", assetIds)
      : Promise.resolve({ data: [] as AddonMediaAsset[] }),
  ]);

  const msrpByItem = new Map<number, { msrp: number; currency: string }>();
  for (const p of pricesResult.data ?? []) {
    if (p.msrp == null) continue;
    msrpByItem.set(p.item_id as number, {
      msrp: Number(p.msrp),
      currency: (p.currency as string) ?? "SGD",
    });
  }

  const suggested = suggestAddons(rows, msrpByItem, { productType, sizeKey });

  const imageByItem = resolveAddonImageUrls(
    mediaRefs,
    (assetsResult.data ?? []) as AddonMediaAsset[],
  );

  const addons = suggested.map((a) => ({
    ...a,
    image_url: imageByItem.get(a.item_id) ?? null,
  }));
  return NextResponse.json({ addons, productType, sizeKey });
}
