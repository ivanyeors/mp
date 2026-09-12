// Reproject Costings into storefront variant prices, then push those to Stripe.
//
//   npm run costings:sync            # dry run — prints the diff, writes nothing
//   npm run costings:sync -- --apply # write product_variants + sync Stripe
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

import { createClient } from "@supabase/supabase-js";

import { resolveVariantPrice, syncVariantPricesFromCostings } from "@/lib/shop/price-sync";

const apply = process.argv.includes("--apply");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

type Row = { msrp: number | null; compare_at_price: number | null };

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (apply) requireEnv("STRIPE_SECRET_KEY");

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: products } = await admin
    .from("products")
    .select("id, slug")
    .eq("status", "active")
    .order("slug");

  // Same resolution the sync uses, run read-only first so the diff is visible before
  // anything is written — to the DB or to Stripe.
  const [{ data: productPrices }, { data: variants }, { data: itemPrices }, { data: bom }, { data: caseItems }] =
    await Promise.all([
      admin.from("product_prices").select("key, kind, product_id, variant, msrp, compare_at_price"),
      admin
        .from("product_variants")
        .select("id, product_id, pillow_product_id, item_id, option1, price_key, price"),
      admin.from("item_prices").select("item_id, msrp, compare_at_price"),
      admin.from("bom_lines").select("product_id, item_id"),
      admin.from("items").select("id, price_family").not("price_family", "is", null),
    ]);

  const familyByItem = new Map<number, string>(
    (caseItems ?? []).map((i) => [Number(i.id), String(i.price_family)]),
  );
  const defaultFamilyByPillow = new Map<number, string>();
  for (const b of bom ?? []) {
    const f = familyByItem.get(Number(b.item_id));
    if (f) defaultFamilyByPillow.set(Number(b.product_id), f);
  }

  const priceByKey = new Map<string, Row>();
  const priceByPillowProduct = new Map<number, Row>();
  const priceByBolsterVariant = new Map<string, Row>();
  const priceByItem = new Map<number, Row>();
  for (const p of productPrices ?? []) {
    const row: Row = { msrp: p.msrp, compare_at_price: p.compare_at_price };
    priceByKey.set(p.key, row);
    if (p.kind === "pillow" && p.product_id != null) {
      const wanted = defaultFamilyByPillow.get(Number(p.product_id)) ?? null;
      if (p.variant == null || p.variant === wanted) priceByPillowProduct.set(p.product_id, row);
    }
    if (p.kind === "bolster" && p.variant) priceByBolsterVariant.set(p.variant, row);
  }
  for (const ip of itemPrices ?? []) {
    const row: Row = { msrp: ip.msrp, compare_at_price: ip.compare_at_price };
    priceByItem.set(ip.item_id, row);
    priceByKey.set(`item:${ip.item_id}`, row);
  }

  const slugById = new Map((products ?? []).map((p) => [p.id as string, p.slug as string]));
  let changed = 0;
  let unresolved = 0;

  console.log(`${apply ? "Applying" : "Dry run —"} Costings → product_variants → Stripe\n`);
  for (const v of variants ?? []) {
    const slug = slugById.get(v.product_id as string);
    if (!slug) continue; // inactive product
    const next = resolveVariantPrice(
      v as never,
      priceByKey,
      priceByPillowProduct,
      priceByBolsterVariant,
      priceByItem,
    );
    const current = v.price == null ? null : Number(v.price);
    const label = `${slug} ${v.option1 ?? "—"}`.padEnd(34);
    if (next === null) {
      unresolved++;
      console.log(`  UNRESOLVED  ${label} keeps stale ${current} — no Costings row matches`);
    } else if (current !== next) {
      changed++;
      console.log(`  CHANGE      ${label} ${current} → ${next}`);
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
      `  ${p.slug}: ${result.synced} variant(s) priced, stripe=${result.stripeSync}` +
        (result.unresolvable.length ? `, unresolvable=${result.unresolvable.length}` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
