// Bulk-sync every active product into the Stripe dashboard.
//
//   # 1. start the app so the sync route is reachable
//   pnpm dev
//   # 2. in another shell, run the sync (loads STRIPE_* + SUPABASE_* from env)
//   node --env-file=.env.local scripts/stripe-sync-all.mjs
//   # dry run (lists products, touches neither Stripe nor the DB):
//   node --env-file=.env.local scripts/stripe-sync-all.mjs --dry-run
//
// It lists active products from Supabase, then POSTs each id to the existing
// /api/stripe/sync route, which calls syncProductToStripe(). That route is the
// single source of truth: it creates/updates the Stripe Product + Prices and
// writes stripe_product_id / stripe_price_id back to Supabase. We deliberately
// reuse it instead of re-implementing Stripe calls here.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (required)
//   BASE_URL  (optional, default http://localhost:3000)  -- where the app runs
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const { data: products, error } = await supabase
  .from("products")
  .select("id, slug, stripe_product_id")
  .eq("status", "active")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Failed to load products from Supabase:", error.message);
  process.exit(1);
}

if (!products?.length) {
  console.log("No active products to sync.");
  process.exit(0);
}

console.log(`Found ${products.length} active product(s). Target: ${baseUrl}/api/stripe/sync`);

if (dryRun) {
  for (const p of products) {
    console.log(`  - ${p.slug} (${p.id})${p.stripe_product_id ? " [already linked]" : ""}`);
  }
  console.log("Dry run: no changes made.");
  process.exit(0);
}

let ok = 0;
const failures = [];

for (const p of products) {
  try {
    const res = await fetch(`${baseUrl}/api/stripe/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: p.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok !== true) {
      throw new Error(json.error ? JSON.stringify(json.error) : `HTTP ${res.status}`);
    }
    ok += 1;
    console.log(`  OK  ${p.slug} -> ${json.stripe_product_id} (${json.variant_count} price[s])`);
  } catch (err) {
    failures.push({ slug: p.slug, id: p.id, reason: err?.message || String(err) });
    console.error(`  ERR ${p.slug}: ${err?.message || err}`);
  }
}

console.log(`\nDone. Synced ${ok}/${products.length}. Failed: ${failures.length}.`);
if (failures.length) {
  for (const f of failures) console.error(`  - ${f.slug} (${f.id}): ${f.reason}`);
  process.exit(1);
}
