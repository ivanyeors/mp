// Bulk-sync every active product into the Stripe dashboard.
//
//   # loads STRIPE_* + SUPABASE_* from env; the app does NOT need to be running
//   npx tsx --env-file=.env.local scripts/stripe-sync-all.ts
//   # dry run (lists products, touches neither Stripe nor the DB):
//   npx tsx --env-file=.env.local scripts/stripe-sync-all.ts --dry-run
//   # populate the LIVE account without putting a live key in STRIPE_SECRET_KEY:
//   npx tsx --env-file=.env.local scripts/stripe-sync-all.ts --live
//
// It lists active products from Supabase, then calls syncProductToStripe() for
// each — the same function /api/stripe/sync calls, which creates/updates the
// Stripe Product + Prices and writes stripe_product_id / stripe_price_id back to
// Supabase.
//
// It used to POST to that route over HTTP, which is why the route had to stay
// unauthenticated. The route is now Staff-gated, and calling the function
// directly is what the old comment ("reuse it instead of re-implementing Stripe
// calls here") was actually after — with one fewer moving part and no dev server.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
//      STRIPE_SECRET_KEY_LIVE — only for --live

import { createClient } from "@supabase/supabase-js";
import { StripeNeedsAttentionError, syncProductToStripe } from "@/lib/stripe/sync";
import { stripeMode, stripeProductIdColumn } from "@/lib/stripe/mode";

const dryRun = process.argv.includes("--dry-run");
const live = process.argv.includes("--live");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// Wrapped rather than top-level await: tsx compiles a .ts entrypoint as CJS,
// where top-level await is a syntax error. The old .mjs was ESM and could.
async function main() {
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // --live swaps the key IN PROCESS rather than asking anyone to edit .env.local,
  // so a laptop stays pointed at the sandbox for everything else. Everything
  // downstream — the Stripe client and the column `stripeMode()` resolves — reads
  // STRIPE_SECRET_KEY, so setting it here keeps the account and the column it
  // writes to in agreement. Both are lazy, so this must happen before the first use.
  if (live) {
    const liveKey = requireEnv("STRIPE_SECRET_KEY_LIVE");
    if (liveKey.includes("_test_")) {
      console.error("STRIPE_SECRET_KEY_LIVE is a TEST key. Refusing to mislabel it as live.");
      process.exit(1);
    }
    process.env.STRIPE_SECRET_KEY = liveKey;
  }
  if (!dryRun) requireEnv("STRIPE_SECRET_KEY");

  const mode = stripeMode();
  if (live && mode !== "live") {
    console.error(`--live was passed but the resolved mode is "${mode}". Aborting.`);
    process.exit(1);
  }
  console.log(`Stripe mode: ${mode} (writing products.${stripeProductIdColumn(mode)})`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: products, error } = await supabase
    .from("products")
    .select("id, slug, stripe_product_id, stripe_product_id_test")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load products from Supabase:", error.message);
    process.exit(1);
  }

  if (!products?.length) {
    console.log("No active products to sync.");
    return;
  }

  console.log(`Found ${products.length} active product(s).`);

  if (dryRun) {
    for (const p of products) {
      const linked = mode === "test" ? p.stripe_product_id_test : p.stripe_product_id;
      console.log(`  - ${p.slug} (${p.id})${linked ? ` [linked: ${linked}]` : ""}`);
    }
    console.log("Dry run: no changes made.");
    return;
  }

  let ok = 0;
  const failures: { slug: string; id: string; reason: string }[] = [];

  for (const p of products) {
    try {
      const result = await syncProductToStripe(p.id);
      ok += 1;
      console.log(
        `  OK  ${p.slug} -> ${result.stripeProductId} (${result.variants.length} price[s])`,
      );
      for (const notice of result.notices) console.log(`      ${notice}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ slug: p.slug, id: p.id, reason });
      console.error(`  ERR ${p.slug}: ${reason}`);
      if (err instanceof StripeNeedsAttentionError) {
        for (const notice of err.notices) console.error(`      ${notice}`);
      }
    }
  }

  console.log(`\nDone. Synced ${ok}/${products.length}. Failed: ${failures.length}.`);
  if (failures.length) {
    for (const f of failures) console.error(`  - ${f.slug} (${f.id}): ${f.reason}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
