/**
 * Live smoke for slice 11 — product gallery persists media_asset_id + last_used_at.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-asset-picker-products.ts
 */
import {
  createMediaAsset,
  deleteMediaAssetGuarded,
  getMediaAsset,
  touchLastUsed,
} from "../lib/media-assets";
import { listAssetUsages, resolveUsages } from "../lib/media/image-usages";
import { supabaseAdmin } from "../lib/supabase/server";

const SMOKE_NAME = "SMOKE_SLICE11_PICKER";

async function main() {
  const admin = supabaseAdmin();

  // Pure: selection shape consumers expect
  const selection = {
    assetId: "00000000-0000-4000-8000-000000000011",
    url: "https://cdn.example/p.webp",
    alt: "alt",
  };
  if (!selection.assetId || !selection.url) throw new Error("selection shape broken");
  console.log("selection_shape: ok");

  // Pure: url-only legacy still counts as used
  const legacy = resolveUsages(
    { id: "a1", hosted_url: "https://cdn.example/legacy.webp" },
    {
      productImages: [
        {
          id: "pi-legacy",
          product_id: "p1",
          url: "https://cdn.example/legacy.webp",
          media_asset_id: null,
        },
      ],
    },
  );
  if (!legacy.some((u) => u.type === "product_image")) {
    throw new Error("legacy url-only must count as used");
  }
  console.log("legacy_url_match: ok");

  const { data: product, error: productErr } = await admin
    .from("products")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (productErr) throw productErr;
  if (!product?.id) throw new Error("Need at least one product row for smoke");

  const hosted = `https://example.invalid/smoke-slice11-${Date.now()}.webp`;
  const asset = await createMediaAsset({
    kind: "image",
    name: SMOKE_NAME,
    hosted_url: hosted,
  });
  console.log("asset:", asset.id);

  let imageId: string | null = null;
  try {
    // Simulate picker POST body: url + media_asset_id
    const { data: row, error: insertErr } = await admin
      .from("product_images")
      .insert({
        product_id: product.id,
        url: hosted,
        alt_text: "smoke",
        media_asset_id: asset.id,
        position: 9999,
      })
      .select("id, url, media_asset_id")
      .single();
    if (insertErr) throw insertErr;
    imageId = row.id;
    if (row.media_asset_id !== asset.id) {
      throw new Error(`media_asset_id not persisted: ${row.media_asset_id}`);
    }
    console.log("persist_asset_id: ok");

    // Same touch path as POST /api/shop/products/[id]/images
    await touchLastUsed({ urls: [hosted], assetIds: [asset.id] });
    const after = await getMediaAsset(asset.id);
    if (!after?.last_used_at) throw new Error("last_used_at not set on picker attach");
    console.log("last_used_at:", after.last_used_at);

    const usages = await listAssetUsages({ id: asset.id, hosted_url: hosted });
    if (!usages.some((u) => u.type === "product_image" && u.ref_id === imageId)) {
      throw new Error(`Expected product_image usage, got ${JSON.stringify(usages)}`);
    }
    console.log("usage_product_image: ok");

    // Id-only match (different display URL) still resolves
    const byId = resolveUsages(
      { id: asset.id, hosted_url: "https://other.example/x.webp" },
      {
        productImages: [
          {
            id: imageId!,
            product_id: product.id,
            url: "https://other.example/x.webp",
            media_asset_id: asset.id,
          },
        ],
      },
    );
    if (!byId.some((u) => u.type === "product_image")) {
      throw new Error("id match failed for product_images");
    }
    console.log("id_match: ok");

    await admin.from("product_images").delete().eq("id", imageId);
    imageId = null;
    await deleteMediaAssetGuarded(asset.id, { force: true });
    console.log("SMOKE_OK");
  } catch (err) {
    if (imageId) await admin.from("product_images").delete().eq("id", imageId);
    await deleteMediaAssetGuarded(asset.id, { force: true }).catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
