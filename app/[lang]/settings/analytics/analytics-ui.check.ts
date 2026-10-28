/**
 * Static guards: RBAC wires, the intent tabs, and dead Analytics surface cleanup.
 * Run: npx tsx app/[lang]/settings/analytics/analytics-ui.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const page = readFileSync(join(dir, "page.tsx"), "utf8");
const client = readFileSync(join(dir, "AnalyticsClient.tsx"), "utf8");
const sales = readFileSync(join(dir, "SalesTab.tsx"), "utf8");
const actions = readFileSync(join(dir, "actions.ts"), "utf8");
const tabs = readFileSync(join(dir, "tabs.ts"), "utf8");

assert.match(page, /requireAdminPage\("analytics"/);
assert.match(actions, /assertAdmin\("analytics"\)/);
assert.equal((actions.match(/assertAdmin\("analytics"\)/g) ?? []).length, 5);
assert.match(actions, /getProspectJourneyTransitions/);
assert.match(actions, /getProspectJourneyNodeDetail/);
assert.match(actions, /expandPath/);
assert.match(actions, /loadPageTransitionsFromDb/);
// Every money figure comes from the one sold-lines loader.
assert.match(actions, /loadSalesReport/);

// One tab per reader intent, each mounting only its own cards.
assert.match(tabs, /"sales", "stock", "customers", "traffic"/);
assert.match(client, /<TabsContent value="sales"[\s\S]*?<SalesTab/);
assert.match(client, /<TabsContent value="stock"[\s\S]*?<StockTab/);
assert.match(client, /function StockTab[\s\S]*?Inventory movement[\s\S]*?<ProductConfigurationCard/);
assert.match(client, /function CustomersTab[\s\S]*?Results[\s\S]*?<DropOffReasonsCard/);
assert.match(client, /<TabsContent value="traffic"[\s\S]*?<SearchVisibilityCard[\s\S]*?<ProspectJourneyCard/);

assert.match(sales, /TabsTrigger value="all">All</);
assert.match(sales, /TabsTrigger value="orders">Orders</);
assert.match(sales, /TabsTrigger value="shopify">Shopify</);
assert.match(sales, /from "@\/lib\/analytics\/channel-sales"/);
assert.match(sales, /Cost coverage/);

// On-hand stock value lives on Costings (ADR 0006), not here.
for (const src of [client, sales]) {
  assert.doesNotMatch(src, /Inventory at cost/);
  assert.doesNotMatch(src, /Potential revenue \(MSRP\)/);
  assert.doesNotMatch(src, /Unrealized gross margin/);
  assert.doesNotMatch(src, /computeOnHandValueKpis/);
  // Margins come from sold lines on the server, never from the browser's own reads.
  assert.doesNotMatch(src, /supabaseClient/);
}
assert.doesNotMatch(client, /127\.0\.0\.1:7242/);
assert.doesNotMatch(actions, /shopifyList/);
assert.doesNotMatch(actions, /getMonthlyInventoryByCategory/);
// "use server" + `export type { X }` from another module emits runtime refs
assert.doesNotMatch(actions, /export type \{[^}]*TimelinePoint/);

for (const gone of [
  "PillowHeatmap.tsx",
  "MonthlyInventoryByCategoryVisx.tsx",
  "UnitMarginBySkuVisx.tsx",
  // MSRP × units at today's Costings, read in the browser: replaced by sold lines.
  "MarginByCategoryVisx.tsx",
  "MarginByProductVisx.tsx",
]) {
  assert.equal(existsSync(join(dir, gone)), false, `${gone} should stay deleted`);
}

const inventoryActions = readFileSync(join(dir, "../inventory/actions.ts"), "utf8");
assert.match(inventoryActions, /assertAdmin\('inventory'\)/);
assert.match(inventoryActions, /scheduleMirrorReResolve/);

const costingsSave = readFileSync(join(dir, "../costings/save/route.ts"), "utf8");
assert.match(costingsSave, /requireAdmin\("costings"\)/);
assert.match(costingsSave, /reResolveShopifyLineCosts/);

console.log("analytics-ui.check.ts: ok");
