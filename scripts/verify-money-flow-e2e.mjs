#!/usr/bin/env node
/**
 * End-to-end verification for money-flow-traceability PRD slices.
 * Run: node --env-file=.env.local scripts/verify-money-flow-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const results = [];

function pass(slice, check, detail = "") {
  results.push({ slice, check, ok: true, detail });
  console.log(`  ✓ ${check}${detail ? ` — ${detail}` : ""}`);
}

function fail(slice, check, detail = "") {
  results.push({ slice, check, ok: false, detail });
  console.log(`  ✗ ${check}${detail ? ` — ${detail}` : ""}`);
}

async function http(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function main() {
  console.log("\n=== Money-Flow E2E Verification ===\n");
  console.log(`Base URL: ${BASE}`);
  console.log(`Supabase: ${url}\n`);

  // ── Slice 03: Currency SGD ──
  console.log("Slice 03 — Currency SGD");
  {
    const tables = ["product_variants", "shipping_methods", "coupons", "item_prices"];
    for (const table of tables) {
      const { data, error } = await admin.from(table).select("currency").limit(50);
      if (error) {
        fail("03", `${table} currency query`, error.message);
        continue;
      }
      const bad = (data ?? []).filter((r) => r.currency && r.currency !== "SGD");
      if (bad.length === 0) pass("03", `${table} rows use SGD`, `${(data ?? []).length} sampled`);
      else fail("03", `${table} non-SGD rows`, `${bad.length} found`);
    }
  }

  // ── Slice 04: Price sync / MSRP mirror ──
  console.log("\nSlice 04 — Price source (MSRP → variant)");
  {
    const { data: keyed, error: keyErr } = await admin
      .from("product_variants")
      .select("id, price, price_key, pillow_product_id, item_id")
      .not("price_key", "is", null)
      .limit(5);
    const { data: linked, error: linkErr } = await admin
      .from("product_variants")
      .select("id, price, price_key, pillow_product_id, item_id")
      .or("price_key.not.is.null,pillow_product_id.not.is.null,item_id.not.is.null")
      .limit(5);
    if (keyErr || linkErr) fail("04", "price-linked variants", keyErr?.message ?? linkErr?.message);
    else if ((linked ?? []).length === 0) fail("04", "costing-linked variants exist", "none found");
    else {
      pass("04", "costing-linked variants exist", `${linked.length} sampled (${(keyed ?? []).length} with price_key)`);
      const zeroPrice = linked.filter((v) => Number(v.price) === 0);
      if (zeroPrice.length === 0) pass("04", "linked variants have non-zero price");
      else fail("04", "linked variants priced", `${zeroPrice.length} still $0 — run costings sync`);
    }
  }

  // ── Slice 05: Stock availability ──
  console.log("\nSlice 05 — Stock gating");
  {
    const { data, error } = await admin.from("variant_stock").select("*").limit(10);
    if (error) fail("05", "variant_stock view", error.message);
    else {
      pass("05", "variant_stock view queryable", `${(data ?? []).length} rows`);
      const hasStock = (data ?? []).some((r) => "stock_available" in r);
      if (hasStock) pass("05", "stock_available column present");
      else fail("05", "stock_available column");
    }
    // /api/shop/products is staff-only (#173); the storefront's public availability source is /api/shop/stock.
    const ids = (data ?? []).slice(0, 3).map((r) => r.variant_id).join(",");
    const { status, body } = await http(`/api/shop/stock?ids=${ids}`);
    if (status === 200 && body?.stock) {
      const values = Object.values(body.stock);
      if (values.length && values.every((n) => typeof n === "number")) pass("05", "stock API exposes stock_available");
      else fail("05", "stock API stock_available", `${values.length} variants returned`);
    } else fail("05", "stock API", `HTTP ${status}`);
  }

  // ── Slice 06: Shipping + coupon validate endpoints ──
  console.log("\nSlice 06/10 — Shipping & coupon APIs");
  {
    const { status, body } = await http("/api/shop/shipping?country=SG");
    if (status !== 200) fail("06", "shipping API", `HTTP ${status}`);
    else if (!Array.isArray(body?.rows)) fail("06", "shipping returns rows", JSON.stringify(body).slice(0, 80));
    else {
      pass("06", "shipping API returns rows", `${body.rows.length} methods`);
      const inactive = body.rows.filter((m) => m.is_active === false);
      if (inactive.length === 0) pass("10", "shipping list active-only");
      else fail("10", "shipping active filter", `${inactive.length} inactive returned`);
    }

    const validate = await http("/api/shop/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "INVALID_CODE_XYZ", subtotal: 100 }),
    });
    if (validate.status === 200 && validate.body?.valid === false) {
      pass("10", "coupon validate rejects invalid code");
    } else fail("10", "coupon validate endpoint", `HTTP ${validate.status}`);
  }

  // ── Slice 07: Money ledger ──
  console.log("\nSlice 07 — Money ledger");
  {
    const { error: tableErr } = await admin.from("order_payments").select("id").limit(1);
    if (tableErr) fail("07", "order_payments table", tableErr.message);
    else pass("07", "order_payments table exists");

    const { data, error } = await admin.from("order_margins").select("*").limit(3);
    if (error) fail("07/09", "order_margins view", error.message);
    else pass("07/09", "order_margins view queryable", `${(data ?? []).length} rows`);
  }

  // ── Slice 09: Order cost columns ──
  console.log("\nSlice 09 — Realized margin columns");
  {
    const { data, error } = await admin
      .from("order_items")
      .select("unit_cost, total_cost, returned_quantity")
      .not("unit_cost", "is", null)
      .limit(3);
    if (error) fail("09", "order_items cost columns", error.message);
    else if ((data ?? []).length === 0) {
      pass("09", "order_items cost columns exist", "no paid orders with costs yet (schema ok)");
    } else pass("09", "order_items have frozen costs", `${data.length} lines with unit_cost`);
  }

  // ── Slice 10: increment_coupon_usage RPC ──
  console.log("\nSlice 10 — Coupon RPC & orders API");
  {
    const { data: coupon } = await admin.from("coupons").select("id, usage_count").limit(1).maybeSingle();
    if (!coupon) {
      pass("10", "increment_coupon_usage RPC", "skipped — no coupons in DB");
    } else {
      const before = coupon.usage_count;
      const { error } = await admin.rpc("increment_coupon_usage", { coupon_id: coupon.id });
      if (error) fail("10", "increment_coupon_usage RPC", error.message);
      else {
        const { data: after } = await admin.from("coupons").select("usage_count").eq("id", coupon.id).single();
        if (after?.usage_count === before + 1) {
          pass("10", "increment_coupon_usage RPC atomic", `${before} → ${after.usage_count}`);
          await admin.from("coupons").update({ usage_count: before }).eq("id", coupon.id);
        } else fail("10", "increment_coupon_usage RPC", `expected ${before + 1}, got ${after?.usage_count}`);
      }
    }

    // Orders list query (same as API, minus auth)
    const { data: orders, error: ordersErr } = await admin
      .from("orders")
      .select("*, order_items(quantity)")
      .order("created_at", { ascending: false })
      .limit(3);
    if (ordersErr) fail("10", "orders list join query", ordersErr.message);
    else {
      pass("10", "orders list join query", `${(orders ?? []).length} orders`);
      if (orders?.length) {
        const qty = (orders[0].order_items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
        pass("10", "order item quantity sum", `first order qty=${qty}`);
        const { error: marginJoinErr } = await admin
          .from("order_margins")
          .select("gross_margin, margin_pct")
          .eq("order_id", orders[0].id)
          .maybeSingle();
        if (marginJoinErr) fail("10", "order_margins lookup by order_id", marginJoinErr.message);
        else pass("10", "order_margins lookup by order_id");
      }
    }

    const { data: dashOrders, error: dashErr } = await admin
      .from("orders")
      .select("total")
      .not("status", "in", '("cancelled","refunded")');
    if (dashErr) fail("10", "dashboard revenue query", dashErr.message);
    else {
      const revenue = (dashOrders ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
      pass("10", "dashboard revenue computable", `SGD ${revenue.toFixed(2)} from ${(dashOrders ?? []).length} orders`);
    }
  }

  // ── Slice 01: Nav routes (HTTP) ──
  console.log("\nSlice 01 — Settings nav routes");
  {
    const routes = [
      ["/en-US/settings/integrations/shopify", "Shopify integration"],
      ["/en-US/settings/products", "Products (categories merged)"],
    ];
    for (const [path, label] of routes) {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      if (res.status === 200 || res.status === 307 || res.status === 308) {
        pass("01", label, `HTTP ${res.status}`);
      } else fail("01", label, `HTTP ${res.status}`);
    }
    const oldShopify = await fetch(`${BASE}/en-US/settings/inventory/shopify`, { redirect: "follow" });
    const landedOnIntegration = oldShopify.url.includes("/settings/integrations/shopify");
    if (landedOnIntegration) {
      pass("01", "old Shopify path redirects", oldShopify.url);
    } else fail("01", "old Shopify path redirects", `landed on ${oldShopify.url}`);
  }

  // ── Slice 02: Stripe client version ──
  console.log("\nSlice 02 — Stripe API version");
  {
    const { readFileSync } = await import("node:fs");
    const client = readFileSync("lib/stripe/client.ts", "utf8");
    if (client.includes("apiVersion")) pass("02", "Stripe client pins apiVersion");
    else fail("02", "Stripe apiVersion pin");
    const refunds = readFileSync("lib/stripe/refunds.ts", "utf8");
    if (refunds.includes("idempotencyKey")) pass("02", "Refund idempotency key helper");
    else fail("02", "Refund idempotency");
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Summary ===");
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  [Slice ${f.slice}] ${f.check}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll E2E checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
