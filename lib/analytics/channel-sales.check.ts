/**
 * Run: npx tsx lib/analytics/channel-sales.check.ts
 * unpaid excluded; All ≈ Orders+Shopify; Others in breakdown.
 */
import assert from "node:assert/strict";
import {
  aggregateChannelSales,
  buildShopifyTimeline,
  paidAtInRange,
  shopifyOrderNets,
  type PlatformOrderFact,
  type ShopifyOrderFact,
} from "./channel-sales";

const from = new Date("2026-06-01T00:00:00.000Z");
const to = new Date("2026-06-30T23:59:59.999Z");

// --- unpaid excluded (paid_at only) ---
assert.equal(paidAtInRange(null, from, to), false, "null paid_at excluded");
assert.equal(paidAtInRange("2026-05-15T12:00:00.000Z", from, to), false, "outside range excluded");
assert.equal(paidAtInRange("2026-06-10T12:00:00.000Z", from, to), true, "in-range paid included");

const unpaidPlatform: PlatformOrderFact = {
  paidAt: null,
  netRevenue: 999,
  cogs: 100,
  grossMargin: 899,
};
const paidPlatform: PlatformOrderFact = {
  paidAt: "2026-06-10T12:00:00.000Z",
  netRevenue: 100,
  cogs: 40,
  grossMargin: 60,
};

const ordersOnly = aggregateChannelSales({
  channel: "orders",
  from,
  to,
  platform: [unpaidPlatform, paidPlatform],
  shopify: [],
});
assert.equal(ordersOnly.summary.order_count, 1, "unpaid platform order excluded");
assert.equal(ordersOnly.summary.net_revenue, 100);
assert.equal(ordersOnly.summary.cogs, 40);
assert.equal(ordersOnly.summary.gross_margin, 60);

// --- Shopify nets + Others ---
const shopifyPaid: ShopifyOrderFact = {
  paidAt: "2026-06-12T08:00:00.000Z",
  amountRefunded: 10,
  currency: "SGD",
  lines: [
    {
      quantity: 2,
      grossRevenue: 80,
      totalCost: 30,
      isOthers: false,
      seriesId: "pillow:basic:M",
      seriesName: "Basic Pillow — M",
      seriesCategory: "pillow",
      kind: "product",
      pillowKindSize: "basic:M",
    },
    {
      quantity: 1,
      grossRevenue: 25,
      totalCost: null,
      isOthers: true,
      seriesId: "others",
      seriesName: "Others",
      seriesCategory: "others",
      kind: "others",
    },
  ],
};
const shopifyUnpaid: ShopifyOrderFact = {
  paidAt: null,
  amountRefunded: 0,
  lines: [
    {
      quantity: 9,
      grossRevenue: 500,
      totalCost: 0,
      isOthers: false,
      seriesId: "pillow:basic:S",
      seriesName: "Basic Pillow — S",
      seriesCategory: "pillow",
      kind: "product",
    },
  ],
};

const nets = shopifyOrderNets(shopifyPaid);
assert.equal(nets.netRevenue, 95, "80+25−10 refund"); // 105-10=95
assert.equal(nets.cogs, 30, "Others COGS null → 0");
assert.equal(nets.grossMargin, 65);

const shopifyOnly = aggregateChannelSales({
  channel: "shopify",
  from,
  to,
  platform: [paidPlatform],
  shopify: [shopifyPaid, shopifyUnpaid],
});
assert.equal(shopifyOnly.summary.order_count, 1, "unpaid shopify excluded");
assert.equal(shopifyOnly.summary.net_revenue, 95);
assert.equal(shopifyOnly.summary.currency, "SGD");
assert.ok(
  shopifyOnly.breakdown.some((r) => r.id === "others" && r.isOthers && r.units === 1 && r.revenue === 25),
  "Others present in breakdown"
);

// --- All ≈ Orders + Shopify ---
const all = aggregateChannelSales({
  channel: "all",
  from,
  to,
  platform: [unpaidPlatform, paidPlatform],
  shopify: [shopifyPaid, shopifyUnpaid],
});
assert.equal(all.summary.net_revenue, roundSum(ordersOnly.summary.net_revenue, shopifyOnly.summary.net_revenue));
assert.equal(all.summary.cogs, roundSum(ordersOnly.summary.cogs, shopifyOnly.summary.cogs));
assert.equal(all.summary.gross_margin, roundSum(ordersOnly.summary.gross_margin, shopifyOnly.summary.gross_margin));
assert.equal(all.summary.order_count, 2);
assert.ok(all.breakdown.some((r) => r.isOthers), "Others in All breakdown");

const timeline = buildShopifyTimeline({ from, to, shopify: [shopifyPaid, shopifyUnpaid] });
assert.ok(timeline.products.some((s) => s.id === "others"), "Others in timeline products");
assert.equal(timeline.currency, "SGD");
const othersPt = timeline.products.find((s) => s.id === "others")!.data.find((p) => p.units > 0);
assert.ok(othersPt && othersPt.units === 1 && othersPt.revenue === 25);

function roundSum(a: number, b: number): number {
  return Math.round((a + b + Number.EPSILON) * 100) / 100;
}

console.log("channel-sales.check.ts: ok");
