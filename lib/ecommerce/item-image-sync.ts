import type { SupabaseClient } from "@supabase/supabase-js";

export type GalleryRow = { id: string; media_asset_id: string | null; position: number };
export type NewImage = { assetId: string; url: string; altText: string | null };

export type GalleryOp =
  | { kind: "none" }
  | { kind: "replace"; rowId: string }
  | { kind: "prepend" }
  | { kind: "delete"; rowId: string };

/** Decide how one product's gallery follows an item's image change from `oldAssetId` to `next`. */
export function planGalleryOp(
  rows: GalleryRow[],
  oldAssetId: string | null,
  next: NewImage | null,
): GalleryOp {
  const oldRow = oldAssetId ? rows.find((r) => r.media_asset_id === oldAssetId) : undefined;
  const hasNext = next ? rows.some((r) => r.media_asset_id === next.assetId) : false;
  if (!next) return oldRow ? { kind: "delete", rowId: oldRow.id } : { kind: "none" };
  if (hasNext) return oldRow && oldRow.media_asset_id !== next.assetId ? { kind: "delete", rowId: oldRow.id } : { kind: "none" };
  return oldRow ? { kind: "replace", rowId: oldRow.id } : { kind: "prepend" };
}

async function loadImage(admin: SupabaseClient, assetId: string | null): Promise<NewImage | null> {
  if (!assetId) return null;
  const { data: asset, error } = await admin
    .from("media_assets")
    .select("id, hosted_url, alt_text")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return asset?.hosted_url ? { assetId: asset.id, url: asset.hosted_url, altText: asset.alt_text ?? null } : null;
}

/** Make `next` the product's base gallery image, replacing the row holding `oldAssetId`. */
async function applyGalleryImage(
  admin: SupabaseClient,
  productId: string,
  oldAssetId: string | null,
  next: NewImage | null,
): Promise<void> {
  const { data: rows, error } = await admin
    .from("product_images")
    .select("id, media_asset_id, position")
    .eq("product_id", productId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const op = planGalleryOp(rows ?? [], oldAssetId, next);
  if (op.kind === "delete") {
    await admin.from("product_images").delete().eq("id", op.rowId);
  } else if (op.kind === "replace" && next) {
    await admin
      .from("product_images")
      .update({ url: next.url, media_asset_id: next.assetId, alt_text: next.altText })
      .eq("id", op.rowId);
  } else if (op.kind === "prepend" && next) {
    // ponytail: per-row shift, galleries are a handful of images
    for (const r of rows ?? []) {
      await admin.from("product_images").update({ position: r.position + 1 }).eq("id", r.id);
    }
    await admin.from("product_images").insert({
      product_id: productId,
      url: next.url,
      media_asset_id: next.assetId,
      alt_text: next.altText,
      position: 0,
    });
  }
}

/**
 * Item image is the source of truth for the base image of every storefront
 * product projected from it: variant `image_url` plus one gallery row (Primary on first add).
 */
export async function syncItemImageToProducts(
  admin: SupabaseClient,
  itemId: number,
  oldAssetId: string | null,
  newAssetId: string | null,
): Promise<void> {
  const next = await loadImage(admin, newAssetId);

  const { data: variants, error: vErr } = await admin
    .from("product_variants")
    .update({ image_url: next?.url ?? null })
    .eq("item_id", itemId)
    .select("product_id");
  if (vErr) throw new Error(vErr.message);

  const productIds = [...new Set((variants ?? []).map((v: { product_id: string }) => v.product_id))];
  for (const productId of productIds) {
    // Sibling sizes may still show the old photo; leave their row alone.
    let oldStillUsed = false;
    if (oldAssetId) {
      const { data: siblings, error: sErr } = await admin
        .from("product_variants")
        .select("item_id, items!inner(primary_media_asset_id)")
        .eq("product_id", productId)
        .neq("item_id", itemId)
        .eq("items.primary_media_asset_id", oldAssetId);
      if (sErr) throw new Error(sErr.message);
      oldStillUsed = (siblings ?? []).length > 0;
    }
    await applyGalleryImage(admin, productId, oldStillUsed ? null : oldAssetId, next);
  }
}

/**
 * Base image for a pillow/bolster storefront product, set from Inventory.
 * Every variant's `image_url` holds it, so the previous image is read back from there.
 */
export async function setProductBaseImage(
  admin: SupabaseClient,
  productId: string,
  newAssetId: string | null,
): Promise<string | null> {
  const next = await loadImage(admin, newAssetId);
  if (newAssetId && !next) throw new Error("Image has no hosted URL");

  const { data: variants, error: vErr } = await admin
    .from("product_variants")
    .select("image_url")
    .eq("product_id", productId);
  if (vErr) throw new Error(vErr.message);
  const oldUrl = (variants ?? []).map((v: { image_url: string | null }) => v.image_url).find(Boolean) ?? null;

  let oldAssetId: string | null = null;
  if (oldUrl) {
    const { data: oldRow, error } = await admin
      .from("product_images")
      .select("media_asset_id")
      .eq("product_id", productId)
      .eq("url", oldUrl)
      .not("media_asset_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    oldAssetId = oldRow?.media_asset_id ?? null;
  }

  const { error: uErr } = await admin
    .from("product_variants")
    .update({ image_url: next?.url ?? null })
    .eq("product_id", productId);
  if (uErr) throw new Error(uErr.message);

  await applyGalleryImage(admin, productId, oldAssetId, next);
  return next?.url ?? null;
}
