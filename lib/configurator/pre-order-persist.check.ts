import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { preOrderFlagForResult } from "./pre-order-persist";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert.equal(
  preOrderFlagForResult({ preferenceStocks: [0], composedBuildable: 5 }),
  true,
  "preference OOS → is_pre_order true",
);
assert.equal(
  preOrderFlagForResult({ preferenceStocks: [10], composedBuildable: 0 }),
  true,
  "buildable 0 → is_pre_order true",
);
assert.equal(
  preOrderFlagForResult({ preferenceStocks: [3], composedBuildable: 5 }),
  false,
  "in-stock / soft low-stock → is_pre_order false",
);

const migration = read("supabase/migrations/20260715150000_result_is_pre_order.sql");
assert.match(migration, /is_pre_order\s+boolean\s+not\s+null\s+default\s+false/i);
assert.match(migration, /mp_config_responses/);

const hold = read("app/api/results/hold/route.ts");
assert.match(hold, /isPreOrder|preOrderFlagForResult|loadPreOrderTriggerAtHold/);
assert.match(hold, /is_pre_order/);
assert.match(hold, /loadPreOrderTriggerAtHold/);
assert.match(hold, /preOrderFlagForResult/);

const persist = read("lib/configurator/pre-order-persist.ts");
assert.match(persist, /isPreOrder/);
assert.match(persist, /inventory_balances/);
assert.match(persist, /product_buildable|bolster_buildable/);

const publicApi = read("app/api/results/[id]/route.ts");
assert.match(publicApi, /is_pre_order/);

const adminApi = read("lib/results/admin/response-detail.ts");
assert.match(adminApi, /is_pre_order/);

const customer = read("app/[lang]/results/[id]/page.tsx");
assert.match(customer, /is_pre_order/);
assert.match(customer, /Pre-order/);

const adminPage = read("app/[lang]/settings/results/[id]/result-detail-client.tsx");
assert.match(adminPage, /is_pre_order/);
assert.match(adminPage, /Pre-order/);

for (const rel of [
  "app/api/results/[id]/assign/route.ts",
  "app/api/results/[id]/accept/route.ts",
  "app/api/results/[id]/decline/route.ts",
  "app/api/cron/results-sla/route.ts",
] as const) {
  assert.doesNotMatch(
    read(rel),
    /is_pre_order/,
    `${rel} must not touch sticky is_pre_order`,
  );
}

console.log("pre-order-persist self-check ok");
