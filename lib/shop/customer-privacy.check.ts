import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_ORDER_COLUMNS, ORDER_WITH_ITEMS } from "./customer-orders";

assert.doesNotMatch(ORDER_WITH_ITEMS, /\*/, "customer order reads must list columns, never *");
assert.ok(
  !(CUSTOMER_ORDER_COLUMNS as readonly string[]).includes("internal_notes"),
  "customer order reads must not ask for internal_notes",
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.CUSTOMER_CHECK_EMAIL;
const password = process.env.CUSTOMER_CHECK_PASSWORD;
const accessToken = process.env.CUSTOMER_CHECK_ACCESS_TOKEN;
const refreshToken = process.env.CUSTOMER_CHECK_REFRESH_TOKEN;
const siteUrl = process.env.CUSTOMER_CHECK_SITE_URL?.replace(/\/$/, "");

if (!url || !anonKey || !((email && password) || (accessToken && refreshToken))) {
  console.log("customer-privacy.check.ts: ok (static; skip live — no Supabase env or customer login)");
  process.exit(0);
}

type Cookie = { name: string; value: string };
const jar = new Map<string, string>();
const db: SupabaseClient = createServerClient(url, anonKey, {
  cookies: {
    getAll: (): Cookie[] => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies: (Cookie & { options?: { maxAge?: number } })[]) => {
      for (const c of cookies) {
        if (c.value === "" || c.options?.maxAge === 0) jar.delete(c.name);
        else jar.set(c.name, c.value);
      }
    },
  },
});

const results: { what: string; ok: boolean; detail: string }[] = [];
const record = (what: string, ok: boolean, detail: string) => results.push({ what, ok, detail });

async function mustNotRead(what: string, table: string, columns: string, column?: string) {
  const { data, error } = await db.from(table).select(columns);
  if (error) return record(what, true, `refused (${error.code ?? "error"}: ${error.message})`);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const leaked = column ? rows.filter((r) => r[column] != null && r[column] !== "") : rows;
  record(what, leaked.length === 0, leaked.length ? `LEAKED ${leaked.length} row(s)` : `returned nothing (${rows.length} rows, no values)`);
}

async function mustRead(what: string, run: () => PromiseLike<{ error: { message: string } | null; data: unknown }>) {
  const { data, error } = await run();
  const n = Array.isArray(data) ? `${data.length} row(s)` : data ? "1 row" : "no row";
  record(what, !error, error ? `FAILED: ${error.message}` : n);
  return error ? null : data;
}

async function main() {
  const signedIn =
    email && password
      ? await db.auth.signInWithPassword({ email, password })
      : await db.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });
  if (signedIn.error || !signedIn.data.user) {
    throw new Error(`Could not sign in as the fixture customer: ${signedIn.error?.message ?? "no user"}`);
  }
  const user = signedIn.data.user;
  console.log(`Signed in as ${user.email} (${user.id})`);

  const pages: string[] = [];
  if (siteUrl) {
    const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
    const open = async (path: string) => {
      const res = await fetch(`${siteUrl}${path}`, { headers: { cookie }, redirect: "manual" });
      const html = res.status === 200 ? await res.text() : "";
      const signedOut = html.includes("/account/login?next=");
      record(`page ${path}`, res.status === 200 && !signedOut, `HTTP ${res.status}${signedOut ? " (signed out)" : ""}`);
      pages.push(path);
    };
    await open("/en-US/account");
    await open("/en-US/account/orders");
    await open("/en-US/account/addresses");
    await open("/en-US/appointments?type=readjustment");
  }

  await mustNotRead("customers.notes", "customers", "notes", "notes");
  await mustNotRead("customers.tags", "customers", "tags", "tags");
  await mustNotRead("customers *", "customers", "*", "notes");
  await mustNotRead("orders.internal_notes", "orders", "internal_notes", "internal_notes");
  await mustNotRead("orders *", "orders", "*", "internal_notes");
  await mustNotRead("customer_notes", "customer_notes", "*");
  await mustNotRead("customer_followups (CRM 06)", "customer_followups", "*");
  await mustNotRead("order_items.unit_cost", "order_items", "unit_cost", "unit_cost");
  await mustNotRead("order_items.total_cost", "order_items", "total_cost", "total_cost");
  await mustNotRead("order_items snapshot cogs", "order_items", "cogs:customization_snapshot->cogs", "cogs");
  await mustNotRead("product_variants.cost_price", "product_variants", "cost_price", "cost_price");
  await mustNotRead("item_prices.cost_price", "item_prices", "cost_price", "cost_price");
  await mustNotRead("service_prices.cost_price", "service_prices", "cost_price", "cost_price");
  await mustNotRead("order_margins", "order_margins", "*");
  await mustNotRead("order_shipments", "order_shipments", "*");
  await mustNotRead("shipping_rate_quotes", "shipping_rate_quotes", "*");
  await mustNotRead("shipping_methods.markup_percent", "shipping_methods", "markup_percent", "markup_percent");
  await mustNotRead("shopify_order_lines.unit_cost", "shopify_order_lines", "unit_cost", "unit_cost");

  const me = await mustRead("customers.id (lib/shop/customer-addresses.ts)", () =>
    db.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle(),
  );
  if (!me) console.log("  note: no customer row is linked yet — open /account once, then re-run");
  const orders = (await mustRead("orders + items (getCustomerOrders)", () =>
    db.from("orders").select(ORDER_WITH_ITEMS).order("created_at", { ascending: false }),
  )) as { order_number: string }[] | null;
  for (const o of orders ?? []) {
    await mustRead(`order ${o.order_number} (getCustomerOrderByNumber)`, () =>
      db.from("orders").select(ORDER_WITH_ITEMS).eq("order_number", o.order_number).maybeSingle(),
    );
    if (siteUrl && !pages.some((p) => p.includes("/account/orders/"))) {
      const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
      const path = `/en-US/account/orders/${encodeURIComponent(o.order_number)}`;
      const res = await fetch(`${siteUrl}${path}`, { headers: { cookie }, redirect: "manual" });
      record(`page ${path}`, res.status === 200, `HTTP ${res.status}`);
      pages.push(path);
    }
  }
  await mustRead("customer_addresses (getCustomerAddresses)", () => db.from("customer_addresses").select("*"));

  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.what}: ${r.detail}`);
  if (!siteUrl) console.log("  pages not opened — set CUSTOMER_CHECK_SITE_URL to include them");
  const failed = results.filter((r) => !r.ok);
  assert.equal(failed.length, 0, `${failed.length} check(s) failed: ${failed.map((f) => f.what).join(", ")}`);
}

main()
  .then(async () => {
    if (email && password) await db.auth.signOut();
    console.log("customer-privacy.check.ts: ok");
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
