// Re-cost Shopify order-mirror pillow and bolster lines with their fillings.
//
//   npx tsx --env-file=.env.local scripts/recost-shopify-mirror.ts           # dry run — prints the change
//   npx tsx --env-file=.env.local scripts/recost-shopify-mirror.ts --apply   # writes shopify_order_lines
//
// Until 2026-10-28 a mapped Shopify pillow or bolster was costed from its recipe
// alone, and a recipe carries no fillings (ADR 0003), so Analytics understated
// the COGS of every one and overstated its margin. New and re-resolved lines are
// costed from the whole build now; this corrects the lines frozen before that,
// once. Run it again and it finds nothing to change. See `planMirrorBuildRecost`.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

import {
  loadShopifyMirrorCostingsContext,
  planMirrorBuildRecost,
  type MirrorLineRow,
} from "@/lib/shopify/order-mirror-ingest";
import { selectAll } from "@/lib/supabase/select-all";

const apply = process.argv.includes("--apply");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const lines = (await selectAll(() =>
    admin
      .from("shopify_order_lines")
      .select(
        "shopify_line_item_id,shopify_order_id,shopify_variant_id,sku,title,quantity,gross_revenue,unit_cost,total_cost,mapping_kind,is_others,updated_at",
      )
      .not("shopify_variant_id", "is", null)
      .order("shopify_line_item_id"),
  )) as MirrorLineRow[];

  const ctx = await loadShopifyMirrorCostingsContext(
    // The script's client is the same service-role client the app uses.
    admin as unknown as Parameters<typeof loadShopifyMirrorCostingsContext>[0],
    lines.map((l) => Number(l.shopify_variant_id)),
  );
  const patches = planMirrorBuildRecost(lines, ctx);

  const before = new Map(lines.map((l) => [l.shopify_line_item_id, l]));
  let delta = 0;
  let graduated = 0;
  for (const p of patches) {
    const old = before.get(p.shopify_line_item_id)!;
    if (old.is_others) graduated += 1;
    delta += Number(p.total_cost ?? 0) - (old.is_others ? 0 : Number(old.total_cost ?? 0));
  }
  console.log(`${lines.length} mapped lines read; ${patches.length} to re-cost (${graduated} had no cost before).`);
  console.log(`COGS changes by ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} SGD in total.`);

  if (!apply) {
    console.log("Dry run: nothing written. Re-run with --apply to write.");
    return;
  }
  for (let i = 0; i < patches.length; i += 500) {
    const { error } = await admin
      .from("shopify_order_lines")
      .upsert(patches.slice(i, i + 500), { onConflict: "shopify_line_item_id" });
    if (error) throw new Error(error.message);
  }
  console.log(`Wrote ${patches.length} lines.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
