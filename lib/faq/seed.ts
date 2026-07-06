import { supabaseAdmin } from "@/lib/supabase/server";
import { FAQ_DEFAULTS } from "./defaults";

export type SeedFaqOptions = {
  /** Delete existing FAQ rows and re-insert from defaults.ts */
  force?: boolean;
};

/**
 * Insert FAQ categories + items from lib/faq/defaults.ts.
 * Skips if rows already exist unless `force` is true.
 */
export async function seedFaqDatabase(opts: SeedFaqOptions = {}): Promise<{
  ok: boolean;
  seeded: boolean;
  categories: number;
  items: number;
  message: string;
}> {
  const admin = supabaseAdmin();

  const { count, error: countErr } = await admin
    .from("faq_categories")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    return { ok: false, seeded: false, categories: 0, items: 0, message: countErr.message };
  }

  const existing = count ?? 0;
  if (existing > 0 && !opts.force) {
    return {
      ok: true,
      seeded: false,
      categories: existing,
      items: 0,
      message: `Skipped: ${existing} categories already exist (use force to reseed)`,
    };
  }

  if (opts.force && existing > 0) {
    const { error: delItemsErr } = await admin.from("faq_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delItemsErr) {
      return { ok: false, seeded: false, categories: 0, items: 0, message: delItemsErr.message };
    }
    const { error: delCatsErr } = await admin.from("faq_categories").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delCatsErr) {
      return { ok: false, seeded: false, categories: 0, items: 0, message: delCatsErr.message };
    }
  }

  let itemTotal = 0;
  for (let ci = 0; ci < FAQ_DEFAULTS.length; ci++) {
    const cat = FAQ_DEFAULTS[ci];
    const { data: inserted, error: catErr } = await admin
      .from("faq_categories")
      .insert({
        key: cat.key,
        labels: cat.labels,
        position: ci,
        visible: true,
      })
      .select("id")
      .single();

    if (catErr || !inserted) {
      return {
        ok: false,
        seeded: false,
        categories: ci,
        items: itemTotal,
        message: catErr?.message ?? "Category insert failed",
      };
    }

    const rows = cat.items.map((item, ii) => ({
      category_id: inserted.id,
      slug: item.slug,
      content: item.content,
      position: ii,
      visible: true,
    }));

    const { error: itemsErr } = await admin.from("faq_items").insert(rows);
    if (itemsErr) {
      return {
        ok: false,
        seeded: false,
        categories: ci,
        items: itemTotal,
        message: itemsErr.message,
      };
    }
    itemTotal += rows.length;
  }

  return {
    ok: true,
    seeded: true,
    categories: FAQ_DEFAULTS.length,
    items: itemTotal,
    message: `Seeded ${FAQ_DEFAULTS.length} categories and ${itemTotal} items`,
  };
}
