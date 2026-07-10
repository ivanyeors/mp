import { supabaseAdmin } from "@/lib/supabase/server";
import { PAGE_FAQ_DEFAULTS } from "./defaults";
import { isValidSurfaceKey, productSurfaceKey } from "./surface-key";
import type { PageFaqDefaultSet } from "./types";

export type SeedPageFaqOptions = {
  /** Delete Page FAQ rows for surfaces we seed, then re-insert. */
  force?: boolean;
};

async function resolveSurfaceKey(
  def: PageFaqDefaultSet
): Promise<{ surfaceKey: string; skipReason?: string } | null> {
  if (def.surfaceKey) {
    if (!isValidSurfaceKey(def.surfaceKey)) {
      return { surfaceKey: def.surfaceKey, skipReason: `invalid surface_key ${def.surfaceKey}` };
    }
    return { surfaceKey: def.surfaceKey };
  }
  if (!def.productSlug) {
    return { surfaceKey: "", skipReason: "default missing surfaceKey and productSlug" };
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("id")
    .eq("slug", def.productSlug)
    .maybeSingle();
  if (error) return { surfaceKey: "", skipReason: error.message };
  if (!data?.id) {
    return {
      surfaceKey: "",
      skipReason: `product slug not found: ${def.productSlug}`,
    };
  }
  return { surfaceKey: productSurfaceKey(data.id) };
}

/**
 * Insert Page FAQ sets + items from defaults.
 * Seeds each default surface if missing (or all after wipe when force).
 * Product surfaces resolve via stable shop slug → product:{uuid}.
 */
export async function seedPageFaqDatabase(opts: SeedPageFaqOptions = {}): Promise<{
  ok: boolean;
  seeded: boolean;
  sets: number;
  items: number;
  skipped: string[];
  message: string;
}> {
  const admin = supabaseAdmin();
  const skipped: string[] = [];
  let sets = 0;
  let items = 0;

  if (opts.force) {
    // ponytail: wipe only Page FAQ tables — never touch faq_categories / faq_items
    const { error: delItemsErr } = await admin
      .from("faq_page_items")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delItemsErr) {
      return { ok: false, seeded: false, sets: 0, items: 0, skipped, message: delItemsErr.message };
    }
    const { error: delSetsErr } = await admin
      .from("faq_page_sets")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delSetsErr) {
      return { ok: false, seeded: false, sets: 0, items: 0, skipped, message: delSetsErr.message };
    }
  }

  for (const def of PAGE_FAQ_DEFAULTS) {
    const resolved = await resolveSurfaceKey(def);
    if (!resolved || resolved.skipReason) {
      skipped.push(resolved?.skipReason ?? "resolve failed");
      continue;
    }
    const { surfaceKey } = resolved;

    const { data: existing } = await admin
      .from("faq_page_sets")
      .select("id")
      .eq("surface_key", surfaceKey)
      .maybeSingle();

    if (existing && !opts.force) continue;

    const { data: inserted, error: setErr } = await admin
      .from("faq_page_sets")
      .insert({
        surface_key: surfaceKey,
        titles: def.titles,
        visible: true,
      })
      .select("id")
      .single();

    if (setErr || !inserted) {
      return {
        ok: false,
        seeded: sets > 0,
        sets,
        items,
        skipped,
        message: setErr?.message ?? `set insert failed for ${surfaceKey}`,
      };
    }
    sets++;

    const rows = def.items.map((item, ii) => ({
      set_id: inserted.id,
      slug: item.slug,
      content: item.content,
      position: ii,
      visible: true,
    }));

    const { error: itemsErr } = await admin.from("faq_page_items").insert(rows);
    if (itemsErr) {
      return {
        ok: false,
        seeded: true,
        sets,
        items,
        skipped,
        message: itemsErr.message,
      };
    }
    items += rows.length;
  }

  return {
    ok: true,
    seeded: sets > 0,
    sets,
    items,
    skipped,
    message:
      sets > 0
        ? `Seeded ${sets} Page FAQ sets and ${items} items`
        : `No new sets (skipped: ${skipped.length || "none missing"})`,
  };
}
