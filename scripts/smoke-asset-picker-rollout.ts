/**
 * Live smoke for slice 12 — blogs / categories / partners / page builder dual-write.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-asset-picker-rollout.ts
 */
import {
  createMediaAsset,
  deleteMediaAssetGuarded,
  getMediaAsset,
  touchLastUsed,
} from "../lib/media-assets";
import { listAssetUsages, resolveUsages } from "../lib/media/image-usages";
import { supabaseAdmin } from "../lib/supabase/server";

const SMOKE_NAME = "SMOKE_SLICE12_PICKER";

async function main() {
  const admin = supabaseAdmin();
  const hosted = `https://example.invalid/smoke-slice12-${Date.now()}.webp`;

  // Pure: legacy url-only still counts
  const legacy = resolveUsages(
    { id: "a1", hosted_url: "https://cdn.example/legacy.webp" },
    {
      blogs: [
        {
          id: "b",
          slug: "s",
          image_url: "https://cdn.example/legacy.webp",
          content: {},
          media_asset_id: null,
        },
      ],
      categories: [
        { id: "c", slug: "s", image_url: "https://cdn.example/legacy.webp", media_asset_id: null },
      ],
      partners: [
        { id: "p", name: "n", logo_url: "https://cdn.example/legacy.webp", media_asset_id: null },
      ],
      landingSections: [
        { id: "ls", slug: "hero", content: { image: "https://cdn.example/legacy.webp" } },
      ],
      partnersPages: [
        { id: "pp", content: { "en-US": { heroImage: "https://cdn.example/legacy.webp" } } },
      ],
    },
  );
  if (legacy.length < 5) throw new Error(`legacy_url_match failed: ${JSON.stringify(legacy)}`);
  console.log("legacy_url_match: ok");

  const asset = await createMediaAsset({
    kind: "image",
    name: SMOKE_NAME,
    hosted_url: hosted,
  });
  console.log("asset:", asset.id);

  const cleanup: Array<() => Promise<void>> = [];
  try {
    // Blog
    const { data: blog, error: blogErr } = await admin
      .from("blog_posts")
      .insert({
        slug: `smoke-slice12-${Date.now()}`,
        status: "draft",
        author: "smoke",
        image_url: hosted,
        media_asset_id: asset.id,
        content: { "en-US": { title: "Smoke slice 12" } },
      })
      .select("id, media_asset_id")
      .single();
    if (blogErr) throw blogErr;
    if (blog.media_asset_id !== asset.id) throw new Error("blog media_asset_id not persisted");
    cleanup.push(async () => {
      await admin.from("blog_posts").delete().eq("id", blog.id);
    });
    console.log("persist_blog: ok");

    // Category
    const { data: cat, error: catErr } = await admin
      .from("categories")
      .insert({
        slug: `smoke-slice12-${Date.now()}`,
        image_url: hosted,
        media_asset_id: asset.id,
        content: { "en-US": { name: "Smoke Cat" } },
      })
      .select("id, media_asset_id")
      .single();
    if (catErr) throw catErr;
    if (cat.media_asset_id !== asset.id) throw new Error("category media_asset_id not persisted");
    cleanup.push(async () => {
      await admin.from("categories").delete().eq("id", cat.id);
    });
    console.log("persist_category: ok");

    // Partner logo
    const { data: partner, error: partnerErr } = await admin
      .from("partners")
      .insert({
        name: `Smoke Partner ${Date.now()}`,
        logo_url: hosted,
        media_asset_id: asset.id,
        position: 9999,
        visible: false,
      })
      .select("id, media_asset_id")
      .single();
    if (partnerErr) throw partnerErr;
    if (partner.media_asset_id !== asset.id) throw new Error("partner media_asset_id not persisted");
    cleanup.push(async () => {
      await admin.from("partners").delete().eq("id", partner.id);
    });
    console.log("persist_partner: ok");

    // Partners page hero (JSONB) — restore previous content after
    const { data: pageRow } = await admin.from("partners_page").select("id, content").limit(1).maybeSingle();
    const prevPageContent = pageRow?.content ?? null;
    const pageContent = {
      "en-US": { heroImage: hosted, media_asset_id: asset.id, title: "smoke" },
    };
    if (pageRow) {
      const { error } = await admin
        .from("partners_page")
        .update({ content: pageContent })
        .eq("id", pageRow.id);
      if (error) throw error;
      cleanup.push(async () => {
        await admin.from("partners_page").update({ content: prevPageContent }).eq("id", pageRow.id);
      });
    } else {
      const { data: inserted, error } = await admin
        .from("partners_page")
        .insert({ content: pageContent })
        .select("id")
        .single();
      if (error) throw error;
      cleanup.push(async () => {
        await admin.from("partners_page").delete().eq("id", inserted.id);
      });
    }
    console.log("persist_partners_page: ok");

    // Landing section (JSONB) — pick any section, restore after
    const { data: section } = await admin
      .from("landing_sections")
      .select("id, content")
      .limit(1)
      .maybeSingle();
    if (!section?.id) throw new Error("Need at least one landing_sections row");
    const prevSectionContent = section.content;
    const { error: sectionErr } = await admin
      .from("landing_sections")
      .update({
        content: { ...(section.content as object), image: hosted, media_asset_id: asset.id },
      })
      .eq("id", section.id);
    if (sectionErr) throw sectionErr;
    cleanup.push(async () => {
      await admin.from("landing_sections").update({ content: prevSectionContent }).eq("id", section.id);
    });
    console.log("persist_landing_section: ok");

    await touchLastUsed({ urls: [hosted], assetIds: [asset.id] });
    const after = await getMediaAsset(asset.id);
    if (!after?.last_used_at) throw new Error("last_used_at not set");
    console.log("last_used_at:", after.last_used_at);

    const usages = await listAssetUsages({ id: asset.id, hosted_url: hosted });
    const types = new Set(usages.map((u) => u.type));
    for (const t of ["blog_featured", "category", "partner", "partners_page", "landing_section"]) {
      if (!types.has(t as never)) {
        throw new Error(`Expected usage type ${t}, got ${JSON.stringify(usages)}`);
      }
    }
    console.log("usage_all_surfaces: ok");

    // Id-only match (different display URL)
    const byId = resolveUsages(
      { id: asset.id, hosted_url: "https://other.example/x.webp" },
      {
        blogs: [
          {
            id: blog.id,
            slug: "s",
            image_url: "https://other.example/x.webp",
            content: {},
            media_asset_id: asset.id,
          },
        ],
        categories: [
          {
            id: cat.id,
            slug: "s",
            image_url: "https://other.example/x.webp",
            media_asset_id: asset.id,
          },
        ],
        partners: [
          {
            id: partner.id,
            name: "n",
            logo_url: "https://other.example/x.webp",
            media_asset_id: asset.id,
          },
        ],
        landingSections: [
          {
            id: section.id,
            slug: "hero",
            content: { image: "https://other.example/x.webp", media_asset_id: asset.id },
          },
        ],
        partnersPages: [
          {
            id: "pp",
            content: {
              "en-US": { heroImage: "https://other.example/x.webp", media_asset_id: asset.id },
            },
          },
        ],
      },
    );
    if (byId.length < 5) throw new Error(`id_match failed: ${JSON.stringify(byId)}`);
    console.log("id_match: ok");

    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
    await deleteMediaAssetGuarded(asset.id, { force: true });
    console.log("SMOKE_OK");
  } catch (err) {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
    await deleteMediaAssetGuarded(asset.id, { force: true }).catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
