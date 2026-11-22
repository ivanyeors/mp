// Reproject Costings into storefront variant prices, then push those to Stripe.
//
//   npm run costings:sync                    # dry run — prints the diff, writes nothing
//   npm run costings:sync -- --apply         # write product_variants + sync Stripe
//   npm run costings:sync -- --apply --live  # ...against the LIVE Stripe account
//
// `stripe:sync-all` does NOT do this. It re-pushes whatever `product_variants.price`
// already holds, so a variant whose Costings row changed (or was deleted) keeps its
// stale price and Stripe is confidently updated to the wrong number — which is how
// premium XL came to be listed at 1000 while its BOM ships a 113 linen case.
//
// Unresolvable variants are reported as failures rather than skipped quietly:
// `syncVariantPricesFromCostings` leaves their price untouched, and a stale price is
// indistinguishable from a correct one once it reaches Stripe.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
//      STRIPE_SECRET_KEY_LIVE — only for --live

import { createClient } from "@supabase/supabase-js";

import {
  loadCostingsPriceMaps,
  resolveVariantCompareAt,
  resolveVariantPrice,
  syncVariantPricesFromCostings,
} from "@/lib/shop/price-sync";

const apply = process.argv.includes("--apply");
const live = process.argv.includes("--live");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Swapped in process so a laptop keeps STRIPE_SECRET_KEY on the sandbox. Must
  // happen before the Stripe client or `stripeMode()` is first read — both are lazy.
  if (live) {
    const liveKey = requireEnv("STRIPE_SECRET_KEY_LIVE");
    if (liveKey.includes("_test_")) {
      console.error("STRIPE_SECRET_KEY_LIVE is a TEST key. Refusing to mislabel it as live.");
      process.exit(1);
    }
    process.env.STRIPE_SECRET_KEY = liveKey;
  }
  if (apply) requireEnv("STRIPE_SECRET_KEY");

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: products, error: productsErr } = await admin
    .from("products")
    .select("id, slug")
    .eq("status", "active")
    .order("slug");

  const { data: variants, error: variantsErr } = await admin
    .from("product_variants")
    .select(
      "id, product_id, pillow_product_id, item_id, option1, price_key, price, compare_at_price",
    );

  // The SAME maps the sync writes from — imported, not re-derived. A hand copy had
  // already drifted on compare-at and on which products it enumerated.
  const maps = await loadCostingsPriceMaps(admin as never);
  const failedReads = [
    ...(productsErr ? [`products (${productsErr.message})`] : []),
    ...(variantsErr ? [`product_variants (${variantsErr.message})`] : []),
    ...maps.failedReads,
  ];
  if (failedReads.length > 0) {
    console.error(`Couldn't read ${failedReads.join(", ")}. No diff shown and nothing written; run it again.`);
    process.exit(1);
  }

  const slugById = new Map((products ?? []).map((p) => [p.id as string, p.slug as string]));
  let changed = 0;
  let unresolved = 0;

  const { stripeMode } = await import("@/lib/stripe/mode");
  console.log(
    `${apply ? "Applying" : "Dry run —"} Costings → product_variants → Stripe ` +
      `(${stripeMode()} mode)\n`,
  );
  for (const v of variants ?? []) {
    const slug = slugById.get(v.product_id as string);
    if (!slug) continue; // inactive product
    const args = [
      maps.priceByKey,
      maps.priceByPillowProduct,
      maps.priceByBolsterVariant,
      maps.priceByItem,
    ] as const;
    const next = resolveVariantPrice(v as never, ...args);
    const nextCompareAt = resolveVariantCompareAt(v as never, ...args);
    const current = v.price == null ? null : Number(v.price);
    const currentCompareAt = v.compare_at_price == null ? null : Number(v.compare_at_price);
    const label = `${slug} ${v.option1 ?? "—"}`.padEnd(34);
    if (next === null) {
      unresolved++;
      console.log(`  UNRESOLVED  ${label} keeps stale ${current} — no Costings row matches`);
    } else if (current !== next || currentCompareAt !== nextCompareAt) {
      changed++;
      const compareNote =
        currentCompareAt === nextCompareAt
          ? ""
          : `  (compare-at ${currentCompareAt} → ${nextCompareAt})`;
      console.log(`  CHANGE      ${label} ${current} → ${next}${compareNote}`);
    } else {
      console.log(`  ok          ${label} ${next}`);
    }
  }

  console.log(`\n${changed} change(s), ${unresolved} unresolved.`);

  if (!apply) {
    console.log("Nothing written. Re-run with --apply to write and push to Stripe.");
    return;
  }
  if (unresolved > 0) {
    console.error(
      "\nRefusing to apply: an unresolved variant keeps its old price, and pushing that " +
        "to Stripe makes a stale number look deliberate. Fix Costings first.",
    );
    process.exit(1);
  }

  for (const p of products ?? []) {
    const result = await syncVariantPricesFromCostings(p.id as string);
    console.log(
      `  ${p.slug}: ${result.synced} variant(s) priced` +
        (result.unresolvable.length ? `, unresolvable=${result.unresolvable.length}` : ""),
    );
    for (const problem of result.problems) console.error(`    ${p.slug}: ${problem.message}`);
    if (result.problems.some((problem) => !problem.notice)) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
