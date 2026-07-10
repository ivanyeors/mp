/**
 * Live smoke for slice 10 — usage resolver + last_used_at on landing save.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-usage-resolver.ts
 */
import {
  createMediaAsset,
  deleteMediaAssetGuarded,
  getMediaAsset,
  MediaAssetInUseError,
  touchLastUsed,
} from "../lib/media-assets";
import { listAssetUsages, resolveUsages } from "../lib/media/image-usages";
import { supabaseAdmin } from "../lib/supabase/server";

const SMOKE_KEY = "landing_smoke_slice10";
const SMOKE_NAME = "SMOKE_SLICE10_USAGE";

async function main() {
  const admin = supabaseAdmin();

  // Pure: order exclusion (no DB)
  const excluded = resolveUsages(
    { id: "x", hosted_url: "https://cdn.example/o.webp" },
    { orderItems: [{ id: "1", image_url: "https://cdn.example/o.webp" }] },
  );
  if (excluded.length !== 0) throw new Error("order_items must be excluded");
  console.log("order_exclusion: ok");

  const hosted = `https://example.invalid/smoke-slice10-${Date.now()}.webp`;
  const asset = await createMediaAsset({
    kind: "image",
    name: SMOKE_NAME,
    hosted_url: hosted,
  });
  console.log("asset:", asset.id);

  try {
    // Attach via landing slot
    await admin.from("site_settings").upsert(
      { key: SMOKE_KEY, value: hosted, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

    const usages = await listAssetUsages({
      id: asset.id,
      hosted_url: hosted,
    });
    if (!usages.some((u) => u.type === "landing_slot" && u.ref_id === SMOKE_KEY)) {
      throw new Error(`Expected landing_slot ${SMOKE_KEY}, got ${JSON.stringify(usages)}`);
    }
    console.log("usage_landing:", usages.map((u) => u.ref_id));

    // Delete blocked
    try {
      await deleteMediaAssetGuarded(asset.id);
      throw new Error("Expected MediaAssetInUseError");
    } catch (err) {
      if (!(err instanceof MediaAssetInUseError)) throw err;
      console.log("delete_blocked: ok");
    }

    // last_used_at via touch (same path as site-settings PUT)
    await touchLastUsed({ urls: [hosted] });
    const after = await getMediaAsset(asset.id);
    if (!after?.last_used_at) throw new Error("last_used_at not set");
    console.log("last_used_at:", after.last_used_at);

    // Id match: temporary product_images-style fixture via resolveUsages
    const byId = resolveUsages(
      { id: asset.id, hosted_url: hosted },
      {
        productImages: [
          {
            id: "pi-smoke",
            product_id: "00000000-0000-0000-0000-000000000001",
            url: "https://other.example/x.webp",
            media_asset_id: asset.id,
          },
        ],
      },
    );
    if (!byId.some((u) => u.type === "product_image")) {
      throw new Error("id match failed");
    }
    console.log("id_match: ok");

    await admin.from("site_settings").delete().eq("key", SMOKE_KEY);
    await deleteMediaAssetGuarded(asset.id, { force: true });
    console.log("SMOKE_OK");
  } catch (err) {
    await admin.from("site_settings").delete().eq("key", SMOKE_KEY);
    await deleteMediaAssetGuarded(asset.id, { force: true }).catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
