/**
 * Slice 07 self-check: Pre-order restock selection + idempotency + wiring.
 * Run: npx tsx lib/configurator/pre-order-restock.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { holdCtaLabel, isPreOrder } from "./pre-order-trigger";
import {
  RESTOCK_NOTIFY_STATUSES,
  restockEmailCopy,
  selectRestockNotifyCandidates,
  stockRecoveredForResult,
  type RestockCandidateRow,
} from "./pre-order-restock";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function row(
  overrides: Partial<RestockCandidateRow> & Pick<RestockCandidateRow, "id">,
): RestockCandidateRow {
  return {
    status: "held",
    is_pre_order: true,
    pre_order_restock_notified_at: null,
    customer_email: "a@b.co",
    access_token: "tok",
    product_type: "pillow",
    preference_lines: [{ item_id: 1 }],
    suggested_size: "M",
    suggested_tier: "standard",
    suggested_length: null,
    ...overrides,
  };
}

// --- Selection: held/assigned Pre-order only ---
const selected = selectRestockNotifyCandidates([
  row({ id: "held-ok" }),
  row({ id: "assigned-ok", status: "assigned" }),
  row({ id: "expired", status: "expired" }),
  row({ id: "declined", status: "declined" }),
  row({ id: "captured", status: "captured" }),
  row({ id: "canceled", status: "canceled" }),
  row({ id: "not-preorder", is_pre_order: false }),
  row({ id: "already", pre_order_restock_notified_at: "2026-07-01T00:00:00Z" }),
  row({ id: "no-email", customer_email: null }),
]);
assert.deepEqual(
  selected.map((r) => r.id).sort(),
  ["assigned-ok", "held-ok"],
  "only held/assigned Pre-order without marker + email",
);
assert.ok(RESTOCK_NOTIFY_STATUSES.includes("held"));
assert.ok(RESTOCK_NOTIFY_STATUSES.includes("assigned"));

// --- Idempotency: second pass empty when marker set ---
assert.equal(
  selectRestockNotifyCandidates([
    row({
      id: "once",
      pre_order_restock_notified_at: "2026-07-15T12:00:00Z",
    }),
  ]).length,
  0,
  "marker excludes re-send",
);

// --- Stock recovered gate (trigger would clear) ---
assert.equal(
  stockRecoveredForResult({ preferenceStocks: [10], composedBuildable: 2 }),
  true,
  "in-stock → notify",
);
assert.equal(
  stockRecoveredForResult({ preferenceStocks: [0], composedBuildable: 5 }),
  false,
  "pref still OOS → skip",
);
assert.equal(
  stockRecoveredForResult({ preferenceStocks: [10], composedBuildable: 0 }),
  false,
  "buildable still 0 → skip",
);

// Soft low-stock alone is not Pre-order → recovered
assert.equal(
  stockRecoveredForResult({ preferenceStocks: [3], composedBuildable: 5 }),
  true,
);

// --- Email copy ---
const copy = restockEmailCopy({
  origin: "https://example.com",
  resultId: "r1",
  accessToken: "t",
});
assert.match(copy.subject, /restock/i);
assert.match(copy.text, /restock/i);
assert.match(copy.text, /Sign in/i);
assert.match(copy.text, /Result/);
assert.match(copy.text, /customisation/i);
assert.match(copy.html, /Sign in/i);
assert.match(copy.html, /Result/);
assert.match(copy.text, /account\/login/);

// --- Slice 05 live trigger still flips CTA ---
assert.equal(holdCtaLabel(isPreOrder({ preferenceStocks: [0], composedBuildable: 1 }).isPreOrder), "Pre-order");
assert.equal(holdCtaLabel(isPreOrder({ preferenceStocks: [5], composedBuildable: 2 }).isPreOrder), "Proceed");

const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.match(mp, /isPreOrder/);
assert.match(mp, /holdCtaLabel/);

// --- Migration ---
const migration = read(
  "supabase/migrations/20260715200000_pre_order_restock_notified_at.sql",
);
assert.match(migration, /pre_order_restock_notified_at\s+timestamptz/i);
assert.match(migration, /mp_config_responses/);

// --- Module + cron wiring ---
const mod = read("lib/configurator/pre-order-restock.ts");
assert.match(mod, /runPreOrderRestockNotices/);
assert.match(mod, /selectRestockNotifyCandidates/);
assert.match(mod, /stockRecoveredForResult/);
assert.match(mod, /pre_order_restock_notified_at/);
assert.match(mod, /loadPreOrderTriggerAtHold/);
assert.doesNotMatch(mod, /is_pre_order:\s*false/, "must not clear sticky is_pre_order");
assert.doesNotMatch(mod, /\.update\(\{[^}]*is_pre_order/, "must not update is_pre_order");

const cronRoute = read("app/api/cron/preorder-restock/route.ts");
assert.match(cronRoute, /runPreOrderRestockNotices/);
assert.match(cronRoute, /CRON_SECRET|authorizeCron/);
assert.doesNotMatch(cronRoute, /Staff|staff.*button|manual send/i);

const sla = read("app/api/cron/results-sla/route.ts");
assert.match(sla, /runPreOrderRestockNotices/);

// No Staff UI send button for restock
assert.doesNotMatch(
  read("app/[lang]/settings/results/[id]/page.tsx"),
  /restock.*email|sendRestock|pre.?order.?restock/i,
);

console.log("pre-order-restock self-check ok");
