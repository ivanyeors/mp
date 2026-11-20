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
assert.match(actions, /loadSalesReport/);

assert.match(tabs, /"sales", "stock", "customers", "traffic"/);
assert.match(client, /<TabsContent value="sales"[\s\S]*?<SalesTab/);
assert.match(client, /<TabsContent value="stock"[\s\S]*?<StockTab/);
assert.match(client, /function StockTab[\s\S]*?Inventory movement[\s\S]*?<ProductConfigurationCard/);
assert.match(client, /function CustomersTab[\s\S]*?Results[\s\S]*?<DropOffReasonsCard/);
assert.match(client, /<TabsContent value="traffic"[\s\S]*?<SearchVisibilityCard[\s\S]*?<ProspectJourneyCard/);

assert.match(sales, /Cost coverage/);

const salesReport = readFileSync(join(dir, "../../../../lib/analytics/sales-report.ts"), "utf8");
for (const src of [client, sales, actions, salesReport]) {
  assert.doesNotMatch(src, /shopify/i);
  assert.doesNotMatch(src, /AnalyticsChannel/);
}
assert.match(salesReport, /from\("order_payments"\)/);
assert.match(salesReport, /occurred_at/);

for (const src of [client, sales]) {
  assert.doesNotMatch(src, /Inventory at cost/);
  assert.doesNotMatch(src, /Potential revenue \(MSRP\)/);
  assert.doesNotMatch(src, /Unrealized gross margin/);
  assert.doesNotMatch(src, /computeOnHandValueKpis/);
  assert.doesNotMatch(src, /supabaseClient/);
}
assert.doesNotMatch(client, /127\.0\.0\.1:7242/);
assert.doesNotMatch(actions, /shopifyList/);
assert.doesNotMatch(actions, /getMonthlyInventoryByCategory/);
assert.doesNotMatch(actions, /export type \{[^}]*TimelinePoint/);

for (const gone of [
  "PillowHeatmap.tsx",
  "MonthlyInventoryByCategoryVisx.tsx",
  "UnitMarginBySkuVisx.tsx",
  "MarginByCategoryVisx.tsx",
  "MarginByProductVisx.tsx",
]) {
  assert.equal(existsSync(join(dir, gone)), false, `${gone} should stay deleted`);
}

console.log("analytics-ui.check.ts: ok");
