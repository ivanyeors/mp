import { monthsBefore } from "@/lib/crm/customer-filters";
import type { PurchaseClass } from "@/lib/crm/customer-overview";
import type { PurchaseLine } from "@/lib/crm/purchase-lines";

/**
 * Fixture for CRM slice 04: Customers, Orders and lines covering every branch
 * of `classifyOrderLine`'s precedence and every Order status, plus the Customers
 * the acceptance filter (`bought=premium&last_order=over:12&readjusted=never`)
 * and the search cases need. Synthetic: invented names, example.com emails.
 *
 * Shared by lib/crm/__tests__/purchase-lines.test.ts (the TypeScript side, and
 * that each line means what its `expect` says) and lib/crm/purchase-lines.check.ts
 * (the same rows inserted into a database, in a transaction that is rolled
 * back, and read through `customer_purchase_lines` and the overview).
 *
 * Pillow products are not invented: a database already holds one per Tier and
 * size, so lines name a Tier and the check looks the id up. `missing` is an id
 * no pillow product has.
 */

export interface PillowIds {
  premium: number;
  basic: number;
  missing: number;
}

/** The ids the vitest side uses; the check reads real ones from the database. */
export const TEST_PILLOW_IDS: PillowIds = { premium: 8, basic: 3, missing: 999_999 };

const id = (n: number) => `c0400000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export interface FixtureCustomer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  /** Whether `bought=premium&last_order=over:12&readjusted=never` lists them. */
  premiumLapsedNeverReadjusted: boolean;
}

export const CUSTOMERS = {
  lapsed: { id: id(1), email: "crm04-lapsed@example.com", first_name: "Lapsed", last_name: "Premium", premiumLapsedNeverReadjusted: true },
  readjusted: { id: id(2), email: "crm04-readjusted@example.com", first_name: "Was", last_name: "Readjusted", premiumLapsedNeverReadjusted: false },
  recent: { id: id(3), email: "crm04-recent@example.com", first_name: "Came", last_name: "Back", premiumLapsedNeverReadjusted: false },
  basic: { id: id(4), email: "crm04-basic@example.com", first_name: "Only", last_name: "Basic", premiumLapsedNeverReadjusted: false },
  cancelled: { id: id(5), email: "crm04-cancelled@example.com", first_name: "Never", last_name: "Paid", premiumLapsedNeverReadjusted: false },
  booked: { id: id(6), email: "crm04-booked@example.com", first_name: "Booked", last_name: "Not Yet", premiumLapsedNeverReadjusted: true },
  mixed: { id: id(7), email: "crm04-mixed@example.com", first_name: "Bolster", last_name: "And Case", premiumLapsedNeverReadjusted: false },
  bracket: { id: id(8), email: "crm04-a%b@example.com", first_name: "Mei", last_name: "Tan (test)", premiumLapsedNeverReadjusted: false },
  lookalike: { id: id(9), email: "crm04-axb@example.com", first_name: "Look", last_name: "Alike", premiumLapsedNeverReadjusted: false },
  comma: { id: id(10), email: "crm04-comma@example.com", first_name: "Ah", last_name: "Tan, Mei", premiumLapsedNeverReadjusted: false },
  statuses: { id: id(11), email: "crm04-statuses@example.com", first_name: null, last_name: null, premiumLapsedNeverReadjusted: false },
} satisfies Record<string, FixtureCustomer>;

export interface FixtureProduct {
  id: string;
  slug: string;
  product_type: "pillow" | "bolster" | "accessory" | "bundle";
}

export const PRODUCTS = {
  pillow: { id: id(101), slug: "crm04-fixture-pillow", product_type: "pillow" },
  bolster: { id: id(102), slug: "crm04-fixture-bolster", product_type: "bolster" },
  accessory: { id: id(103), slug: "crm04-fixture-case", product_type: "accessory" },
  bundle: { id: id(104), slug: "crm04-fixture-bundle", product_type: "bundle" },
} satisfies Record<string, FixtureProduct>;

export interface FixtureVariant {
  id: string;
  product_id: string;
  option1: string | null;
  price_key: string | null;
  pillow: keyof PillowIds | null;
}

export const VARIANTS = {
  premiumPillow: { id: id(201), product_id: PRODUCTS.pillow.id, option1: "M", price_key: null, pillow: "premium" },
  basicPillow: { id: id(202), product_id: PRODUCTS.pillow.id, option1: "M", price_key: null, pillow: "basic" },
  pillowNoProduct: { id: id(203), product_id: PRODUCTS.pillow.id, option1: "M", price_key: null, pillow: null },
  bolster: { id: id(204), product_id: PRODUCTS.bolster.id, option1: "Long", price_key: "product:bolster:long", pillow: null },
  // A bolster variant that also names a pillow product: the bolster wins.
  bolsterWithPillow: { id: id(205), product_id: PRODUCTS.bolster.id, option1: "Short", price_key: null, pillow: "premium" },
  accessory: { id: id(206), product_id: PRODUCTS.accessory.id, option1: null, price_key: null, pillow: null },
  bundle: { id: id(207), product_id: PRODUCTS.bundle.id, option1: null, price_key: null, pillow: null },
} satisfies Record<string, FixtureVariant>;

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "payment_failed"
  | "disputed"
  | "partially_refunded";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "payment_failed",
  "disputed",
  "partially_refunded",
];

export interface FixtureOrder {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: OrderStatus;
  /** Months before `now` it was paid; null for never paid. */
  paidMonthsAgo: number | null;
}

export interface FixtureLine {
  id: string;
  order_id: string;
  kind: "goods" | "service";
  variant_id: string | null;
  snapshot: (pillow: PillowIds) => unknown;
  /** What `customer_purchase_lines` says of it on a counted Order; null when it is not listed. */
  expect: PurchaseLine | null;
  why: string;
}

export interface FixtureBooking {
  id: string;
  customer_id: string;
  status: "booked" | "attended" | "no_show" | "cancelled";
  startMonthsAgo: number;
}

let orderSeq = 0;
let lineSeq = 0;
const orders: FixtureOrder[] = [];
const lines: FixtureLine[] = [];

function order(customer: FixtureCustomer | null, status: OrderStatus, paidMonthsAgo: number | null): string {
  orderSeq += 1;
  const o = { id: id(1000 + orderSeq), order_number: `CRM04-FIX-${String(orderSeq).padStart(3, "0")}`, customer_id: customer?.id ?? null, status, paidMonthsAgo };
  orders.push(o);
  return o.id;
}

function line(
  orderId: string,
  why: string,
  expect: PurchaseLine | null,
  { variant = null, snapshot = () => null, kind = "goods" }: { variant?: FixtureVariant | null; snapshot?: (p: PillowIds) => unknown; kind?: "goods" | "service" } = {},
) {
  lineSeq += 1;
  lines.push({ id: id(5000 + lineSeq), order_id: orderId, kind, variant_id: variant?.id ?? null, snapshot, expect, why });
}

const premium: PurchaseLine = { product_type: "pillow", tier: "premium" };
const basic: PurchaseLine = { product_type: "pillow", tier: "basic" };
const untiered: PurchaseLine = { product_type: "pillow", tier: null };
const bolster: PurchaseLine = { product_type: "bolster", tier: null };
const accessory: PurchaseLine = { product_type: "accessory", tier: null };

// --- the acceptance filter's Customers ------------------------------------
{
  const o = order(CUSTOMERS.lapsed, "delivered", 14);
  line(o, "a shop pillow variant whose pillow product is Premium", premium, { variant: VARIANTS.premiumPillow });
  line(o, "an accessory beside it", accessory, { variant: VARIANTS.accessory });
}
{
  const o = order(CUSTOMERS.readjusted, "delivered", 14);
  line(o, "a Result order: the build in the snapshot, Premium", premium, {
    snapshot: () => ({ result_id: "r-crm04-1", product_type: "pillow", assigned_tier: "premium", assigned_size: "M" }),
  });
}
{
  line(order(CUSTOMERS.recent, "delivered", 14), "a Premium pillow, long ago", premium, { variant: VARIANTS.premiumPillow });
  line(order(CUSTOMERS.recent, "shipped", 2), "and a case two months ago", accessory, { variant: VARIANTS.accessory });
}
line(order(CUSTOMERS.basic, "delivered", 14), "a Basic pillow", basic, { variant: VARIANTS.basicPillow });
line(order(CUSTOMERS.cancelled, "cancelled", 14), "a Premium pillow on a cancelled Order is not listed", null, {
  variant: VARIANTS.premiumPillow,
});
line(order(CUSTOMERS.booked, "delivered", 13), "a legacy cart customisation: the pillow product id is in the snapshot", premium, {
  variant: VARIANTS.accessory,
  snapshot: (p) => ({ pillow_product_id: p.premium }),
});

// --- every branch of the precedence ----------------------------------------
{
  const o = order(CUSTOMERS.mixed, "confirmed", 1);
  line(o, "a bolster variant", bolster, { variant: VARIANTS.bolster });
  line(o, "a bolster variant naming a pillow product: the bolster wins", bolster, { variant: VARIANTS.bolsterWithPillow });
  line(o, "a Result bolster", bolster, { snapshot: () => ({ result_id: "r-crm04-2", product_type: "bolster", assigned_length: "long" }) });
  line(o, "a Service line is never a purchase", null, { kind: "service" });
  line(o, "a bundle is an accessory", accessory, { variant: VARIANTS.bundle });
  line(o, "no variant and no snapshot: an accessory", accessory);
}
{
  const o = order(null, "delivered", 3);
  line(o, "a guest Order's line is listed, with no Customer", premium, { variant: VARIANTS.premiumPillow });
  line(o, "result_id must be a string: a number falls through to the variant", accessory, {
    variant: VARIANTS.accessory,
    snapshot: () => ({ result_id: 5, product_type: "pillow", assigned_tier: "premium" }),
  });
  line(o, "an empty result_id is still a string", untiered, { snapshot: () => ({ result_id: "", product_type: "pillow" }) });
  line(o, "a Result pillow of an unknown Tier", untiered, {
    snapshot: () => ({ result_id: "r-crm04-3", product_type: "pillow", assigned_tier: "deluxe" }),
  });
  line(o, "a Result of another product type falls through", basic, {
    variant: VARIANTS.basicPillow,
    snapshot: () => ({ result_id: "r-crm04-4", product_type: "cushion", assigned_tier: "premium" }),
  });
  line(o, "a pillow product with no pillow id: a pillow of no known Tier", untiered, { variant: VARIANTS.pillowNoProduct });
  line(o, "the variant's pillow id comes before the snapshot's", basic, {
    variant: VARIANTS.basicPillow,
    snapshot: (p) => ({ pillow_product_id: p.premium }),
  });
  line(o, "a snapshot pillow id that is a string is not one", accessory, { snapshot: (p) => ({ pillow_product_id: String(p.premium) }) });
  line(o, "a fractional pillow id names no pillow product", untiered, { snapshot: (p) => ({ pillow_product_id: p.premium + 0.5 }) });
  line(o, "a pillow id no pillow product has", untiered, { snapshot: (p) => ({ pillow_product_id: p.missing }) });
  line(o, "an array snapshot is no snapshot", accessory, { snapshot: () => ["result_id", "pillow"] });
  line(o, "a string snapshot is no snapshot", accessory, { snapshot: () => "pillow" });
}

// --- every Order status ----------------------------------------------------
const COUNTED: Record<OrderStatus, boolean> = {
  pending: false,
  confirmed: true,
  processing: true,
  shipped: true,
  delivered: true,
  cancelled: false,
  refunded: false,
  payment_failed: false,
  disputed: true,
  partially_refunded: true,
};
for (const status of ORDER_STATUSES) {
  line(order(CUSTOMERS.statuses, status, 6), `an Order ${status}, paid`, COUNTED[status] ? accessory : null, {
    variant: VARIANTS.accessory,
  });
}
line(order(CUSTOMERS.statuses, "confirmed", null), "an Order never paid is not counted", null, { variant: VARIANTS.accessory });

// --- the search Customers --------------------------------------------------
line(order(CUSTOMERS.bracket, "delivered", 5), "a case", accessory, { variant: VARIANTS.accessory });

export const ORDERS: readonly FixtureOrder[] = orders;
export const LINES: readonly FixtureLine[] = lines;

export const BOOKINGS: readonly FixtureBooking[] = [
  { id: id(9001), customer_id: CUSTOMERS.readjusted.id, status: "attended", startMonthsAgo: 10 },
  { id: id(9002), customer_id: CUSTOMERS.readjusted.id, status: "no_show", startMonthsAgo: 4 },
  // Booked but not yet attended: still never re-adjusted.
  { id: id(9003), customer_id: CUSTOMERS.booked.id, status: "booked", startMonthsAgo: -1 },
  { id: id(9004), customer_id: CUSTOMERS.mixed.id, status: "cancelled", startMonthsAgo: 0 },
];

/** Which Order statuses the overview counts, as the fixture declares them. */
export const COUNTED_STATUSES = COUNTED;

/** What each search finds among the fixture Customers. */
export const SEARCHES: { search: string; finds: FixtureCustomer[] }[] = [
  { search: "Tan, Mei", finds: [CUSTOMERS.comma] },
  { search: "(test)", finds: [CUSTOMERS.bracket] },
  { search: "a%b", finds: [CUSTOMERS.bracket] },
  { search: "mei tan", finds: [CUSTOMERS.bracket] },
  { search: "a_b", finds: [] },
];

/** What the overview's `bought` holds for each fixture Customer. */
export const BOUGHT: Record<keyof typeof CUSTOMERS, PurchaseClass[]> = {
  lapsed: ["premium", "accessory"],
  readjusted: ["premium"],
  recent: ["premium", "accessory"],
  basic: ["basic"],
  cancelled: [],
  booked: ["premium"],
  mixed: ["mbolster", "accessory"],
  bracket: ["accessory"],
  lookalike: [],
  comma: [],
  statuses: ["accessory"],
};

/** An ISO time `months` before `now` (negative is ahead). */
export function monthsAgo(now: Date, months: number): string {
  return monthsBefore(now, months).toISOString();
}

/** A line as `loadReadjustmentContext`'s query returns it, for `classifyOrderLine`. */
export function lineRow(l: FixtureLine, pillow: PillowIds) {
  const variant = Object.values(VARIANTS).find((v) => v.id === l.variant_id) ?? null;
  const product = variant ? Object.values(PRODUCTS).find((p) => p.id === variant.product_id)! : null;
  return {
    id: l.id,
    kind: l.kind,
    quantity: 1,
    returned_quantity: 0,
    product_title: "Fixture line",
    variant_title: null,
    image_url: null,
    customization_snapshot: (l.snapshot(pillow) ?? null) as Record<string, unknown> | null,
    product_variants: variant
      ? {
          option1: variant.option1,
          price_key: variant.price_key,
          pillow_product_id: variant.pillow ? pillow[variant.pillow] : null,
          products: product ? { product_type: product.product_type } : null,
        }
      : null,
  };
}
