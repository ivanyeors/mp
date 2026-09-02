/**
 * Slice 08 static guards: RBAC wires + dead Analytics surface cleanup.
 * Run: npx tsx app/[lang]/settings/analytics/analytics-ui.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const page = readFileSync(join(dir, "page.tsx"), "utf8");
const client = readFileSync(join(dir, "AnalyticsClient.tsx"), "utf8");
const actions = readFileSync(join(dir, "actions.ts"), "utf8");

assert.match(page, /requireAdminPage\("analytics"/);
assert.match(actions, /assertAdmin\("analytics"\)/);
assert.equal((actions.match(/assertAdmin\("analytics"\)/g) ?? []).length, 7);
assert.match(actions, /getProspectJourneyTransitions/);
assert.match(actions, /getProspectJourneyNodeDetail/);
assert.match(actions, /expandPath/);
assert.match(actions, /loadPageTransitionsFromDb/);

assert.match(client, /TabsTrigger value="all">All</);
assert.match(client, /TabsTrigger value="orders">Orders</);
assert.match(client, /TabsTrigger value="shopify">Shopify</);
assert.match(client, /channel,/);
assert.match(client, /ProductConfigurationCard/);
assert.match(client, /Inventory movement/);
assert.match(client, /Results/);
// Prospect journey must sit above Product Configuration in the render tree
assert.match(client, /<ProspectJourneyCard[\s\S]*?<ProductConfigurationCard/);

assert.doesNotMatch(client, /Inventory at cost/);
assert.doesNotMatch(client, /Potential revenue \(MSRP\)/);
assert.doesNotMatch(client, /Unrealized gross margin/);
assert.doesNotMatch(client, /computeOnHandValueKpis/);
assert.doesNotMatch(client, /127\.0\.0\.1:7242/);
assert.doesNotMatch(actions, /shopifyList/);
assert.doesNotMatch(client, /shopifyList/);
assert.doesNotMatch(actions, /getMonthlyInventoryByCategory/);
// "use server" + `export type { X }` from another module emits runtime refs
assert.doesNotMatch(actions, /export type \{[^}]*TimelinePoint/);
assert.match(client, /from "@\/lib\/analytics\/channel-sales"/);

assert.equal(existsSync(join(dir, "PillowHeatmap.tsx")), false);
assert.equal(existsSync(join(dir, "MonthlyInventoryByCategoryVisx.tsx")), false);
assert.equal(existsSync(join(dir, "UnitMarginBySkuVisx.tsx")), false);

const inventoryActions = readFileSync(
  join(dir, "../inventory/actions.ts"),
  "utf8"
);
assert.match(inventoryActions, /assertAdmin\('inventory'\)/);
assert.match(inventoryActions, /scheduleMirrorReResolve/);

const costingsSave = readFileSync(join(dir, "../costings/save/route.ts"), "utf8");
assert.match(costingsSave, /requireAdmin\("costings"\)/);
assert.match(costingsSave, /reResolveShopifyLineCosts/);

console.log("analytics-ui.check.ts: ok");
