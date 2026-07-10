/**
 * Live smoke for slice 15 — replace-everywhere + landing dual-write Asset ids.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-replace-everywhere.ts
 */
import {
  createMediaAsset,
  deleteMediaAssetGuarded,
} from "../lib/media-assets";
import { listAssetUsages } from "../lib/media/image-usages";
import {
  landingAssetIdKey,
  planReplaceEverywhere,
  runReplaceEverywhere,
} from "../lib/media/replace";
import { supabaseAdmin } from "../lib/supabase/server";

const PREFIX = `SMOKE_S15_${Date.now()}`;
const SLOT_KEY = `landing_smoke_s15_${Date.now()}`;

async function main() {
  const admin = supabaseAdmin();

  // Pure: order snapshots never change
  const planned = planReplaceEverywhere(
    {
      settings: [{ key: "landing_hero", value: "https://cdn.example/old.webp" }],
      orderItems: [{ id: "oi1", image_url: "https://cdn.example/old.webp" }],
    },
    {
      oldUrl: "https://cdn.example/old.webp",
      newUrl: "https://cdn.example/new.webp",
      oldAssetId: "11111111-1111-4111-8111-111111111111",
      newAssetId: "22222222-2222-4222-8222-222222222222",
    },
  );
  if (planned.rows.orderItems?.[0].image_url !== "https://cdn.example/old.webp") {
    throw new Error("order_items must be unchanged by replace");
  }
  console.log("order_exclusion: ok");

  const oldHosted = `https://example.invalid/smoke/${PREFIX}_old.webp`;
  const newHosted = `https://example.invalid/smoke/${PREFIX}_new.webp`;

  const oldAsset = await createMediaAsset({
    kind: "image",
    name: `${PREFIX}_old`,
    hosted_url: oldHosted,
  });
  const newAsset = await createMediaAsset({
    kind: "image",
    name: `${PREFIX}_new`,
    hosted_url: newHosted,
  });
  console.log("assets:", { old: oldAsset.id, next: newAsset.id });

  const cleanup: Array<() => Promise<void>> = [];
  try {
    // Landing dual-write (same path as site-settings PUT)
    const idKey = landingAssetIdKey(SLOT_KEY);
    const now = new Date().toISOString();
    const { error: slotErr } = await admin.from("site_settings").upsert(
      [
        { key: SLOT_KEY, value: oldHosted, updated_at: now },
        { key: idKey, value: oldAsset.id, updated_at: now },
      ],
      { onConflict: "key" },
    );
    if (slotErr) throw slotErr;
    cleanup.push(async () => {
      await admin.from("site_settings").delete().in("key", [SLOT_KEY, idKey]);
    });

    const beforeSlot = await listAssetUsages({
      id: oldAsset.id,
      hosted_url: oldHosted,
    });
    if (!beforeSlot.some((u) => u.type === "landing_slot" && u.ref_id === SLOT_KEY)) {
      throw new Error(`landing dual-write not resolved: ${JSON.stringify(beforeSlot)}`);
    }
    console.log("landing_dual_write: ok");

    // Category + product image + partner
    const { data: cat, error: catErr } = await admin
      .from("categories")
      .insert({
        slug: `${PREFIX}-cat`.toLowerCase().replace(/_/g, "-"),
        image_url: oldHosted,
        media_asset_id: oldAsset.id,
        content: { "en-US": { name: "Smoke S15" } },
      })
      .select("id")
      .single();
    if (catErr) throw catErr;
    cleanup.push(async () => {
      await admin.from("categories").delete().eq("id", cat.id);
    });

    const { data: product } = await admin.from("products").select("id").limit(1).maybeSingle();
    if (!product?.id) throw new Error("Need at least one product for smoke");

    const { data: pi, error: piErr } = await admin
      .from("product_images")
      .insert({
        product_id: product.id,
        url: oldHosted,
        media_asset_id: oldAsset.id,
        position: 9998,
        alt_text: "smoke s15",
      })
      .select("id")
      .single();
    if (piErr) throw piErr;
    cleanup.push(async () => {
      await admin.from("product_images").delete().eq("id", pi.id);
    });

    const { data: partner, error: partnerErr } = await admin
      .from("partners")
      .insert({
        name: `${PREFIX} Partner`,
        logo_url: oldHosted,
        media_asset_id: oldAsset.id,
        position: 9998,
        visible: false,
      })
      .select("id")
      .single();
    if (partnerErr) throw partnerErr;
    cleanup.push(async () => {
      await admin.from("partners").delete().eq("id", partner.id);
    });

    // Blog featured
    const { data: blog, error: blogErr } = await admin
      .from("blog_posts")
      .insert({
        slug: `${PREFIX}-blog`.toLowerCase().replace(/_/g, "-"),
        status: "draft",
        author: "smoke",
        image_url: oldHosted,
        media_asset_id: oldAsset.id,
        content: { "en-US": { title: "Smoke S15", body: `![x](${oldHosted})` } },
      })
      .select("id")
      .single();
    if (blogErr) throw blogErr;
    cleanup.push(async () => {
      await admin.from("blog_posts").delete().eq("id", blog.id);
    });

    // Landing section — restore after
    const { data: section } = await admin
      .from("landing_sections")
      .select("id, content")
      .limit(1)
      .maybeSingle();
    if (!section?.id) throw new Error("Need landing_sections row");
    const prevSection = section.content;
    await admin
      .from("landing_sections")
      .update({
        content: {
          ...(section.content as object),
          image: oldHosted,
          media_asset_id: oldAsset.id,
        },
      })
      .eq("id", section.id);
    cleanup.push(async () => {
      await admin.from("landing_sections").update({ content: prevSection }).eq("id", section.id);
    });

    const beforeUsages = await listAssetUsages({
      id: oldAsset.id,
      hosted_url: oldHosted,
    });
    const beforeTypes = new Set(beforeUsages.map((u) => u.type));
    for (const t of [
      "landing_slot",
      "category",
      "product_image",
      "partner",
      "blog_featured",
      "blog_inline",
      "landing_section",
    ]) {
      if (!beforeTypes.has(t as never)) {
        throw new Error(`pre-replace missing ${t}: ${JSON.stringify(beforeUsages)}`);
      }
    }
    console.log("pre_replace_usages: ok");

    const summary = await runReplaceEverywhere({
      oldUrl: oldHosted,
      newUrl: newHosted,
      oldAssetId: oldAsset.id,
      newAssetId: newAsset.id,
    });
    console.log("replace_summary:", summary);

    if (!summary.landingSlots.includes(SLOT_KEY)) {
      throw new Error(`landing slot not in summary: ${JSON.stringify(summary.landingSlots)}`);
    }
    if (summary.categories < 1 || summary.productImages < 1 || summary.partners < 1) {
      throw new Error(`consumer counts low: ${JSON.stringify(summary)}`);
    }
    if (summary.blogFeatured < 1 || summary.blogInline < 1 || summary.landingSections < 1) {
      throw new Error(`blog/section counts low: ${JSON.stringify(summary)}`);
    }
    console.log("replace_consumers: ok");

    // Companion asset id updated
    const { data: idRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", idKey)
      .maybeSingle();
    if (idRow?.value !== newAsset.id) {
      throw new Error(`landing asset id not swapped: ${idRow?.value}`);
    }
    const { data: urlRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", SLOT_KEY)
      .maybeSingle();
    if (urlRow?.value !== newHosted) {
      throw new Error(`landing url not swapped: ${urlRow?.value}`);
    }
    console.log("landing_ids_swapped: ok");

    const oldUsages = await listAssetUsages({
      id: oldAsset.id,
      hosted_url: oldHosted,
    });
    if (oldUsages.length !== 0) {
      throw new Error(`old asset still used: ${JSON.stringify(oldUsages)}`);
    }
    console.log("old_unused: ok");

    const newUsages = await listAssetUsages({
      id: newAsset.id,
      hosted_url: newHosted,
    });
    const newTypes = new Set(newUsages.map((u) => u.type));
    for (const t of [
      "landing_slot",
      "category",
      "product_image",
      "partner",
      "blog_featured",
      "landing_section",
    ]) {
      if (!newTypes.has(t as never)) {
        throw new Error(`new asset missing ${t}: ${JSON.stringify(newUsages)}`);
      }
    }
    console.log("usage_after_replace: ok");

    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
    await deleteMediaAssetGuarded(oldAsset.id, { force: true });
    await deleteMediaAssetGuarded(newAsset.id, { force: true });
    console.log("SMOKE_OK");
  } catch (err) {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
    await deleteMediaAssetGuarded(oldAsset.id, { force: true }).catch(() => {});
    await deleteMediaAssetGuarded(newAsset.id, { force: true }).catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
