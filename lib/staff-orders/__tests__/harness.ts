/**
 * Test harness for Staff orders (ADR 0048): the shared fake Supabase client,
 * plus what the database does on insert that these paths rely on — several
 * rows in one insert, the order number trigger, and the link token default.
 */

import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";

type Row = Record<string, unknown>;

export const CUSTOMER = "0b0b0b0b-0000-4000-8000-000000000001";
export const STUDIO = "studio-1";
export const EAR_PAD = "0c0c0c0c-0000-4000-8000-000000000001";
export const CASE_M = "0c0c0c0c-0000-4000-8000-000000000002";
export const PILLOW = "0c0c0c0c-0000-4000-8000-000000000003";
export const SOLD_OUT = "0c0c0c0c-0000-4000-8000-000000000004";
export const FLAT = "0d0d0d0d-0000-4000-8000-000000000001";
export const COLLECT = "0d0d0d0d-0000-4000-8000-000000000002";

let seq = 0;

export function staffOrderAdmin(db: FakeDb) {
  const base = fakeSupabaseAdmin(db);
  return {
    from(table: string) {
      // Loosened from the fake's own type so `insert` can take an array too.
      const q = base.from(table) as unknown as Record<string, unknown> & { insert: (row: Row | Row[]) => unknown };
      const insertOne = q.insert.bind(q) as (row: Row) => unknown;
      q.insert = (row: Row | Row[]) => {
        const withDefaults = (r: Row): Row => {
          const out = { ...r };
          if (table === "orders" && !out.order_number) out.order_number = `MP-20261107-${String(++seq).padStart(4, "0")}`;
          if (table === "order_payment_links" && !out.token) out.token = crypto.randomUUID();
          if (!out.created_at) out.created_at = new Date().toISOString();
          return out;
        };
        if (!Array.isArray(row)) return insertOne(withDefaults(row));
        const list = (db[table] ??= []);
        for (const r of row) list.push({ id: `${table}-${list.length + 1}`, ...withDefaults(r) });
        return {
          select: () => ({ then: (res: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(res) }),
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
        };
      };
      return q;
    },
  };
}

/** One Customer, two accessories, a pillow, one sold out; a flat and a self-collect method; Costings. */
export function seedStaffOrderDb(): FakeDb {
  const product = (id: string, title: string, type: string, status = "active") => ({
    id,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    content: { "en-US": { title } },
    product_type: type,
    status,
    category_id: "cat-acc",
  });
  const variant = (id: string, productId: string, title: string, price: number, extra: Row = {}) => ({
    id,
    product_id: productId,
    sku: `SKU-${title}`,
    title,
    price,
    currency: "SGD",
    cost_price: 10,
    image_url: null,
    weight_grams: 200,
    is_active: true,
    pillow_product_id: null,
    item_id: 7,
    track_inventory: true,
    option1: null,
    ...extra,
  });
  return {
    customers: [
      {
        id: CUSTOMER,
        email: "Ada@Example.com",
        first_name: "Ada",
        last_name: "Tan",
        phone: "+6591234567",
        locale: "en-US",
      },
    ],
    products: [
      product("p-ear", "Ear Comfort Pad", "accessory"),
      product("p-case", "Pillow Case", "accessory", "draft"),
      product("p-pillow", "Mpillow Premium", "pillow"),
      product("p-out", "Travel Pouch", "accessory"),
    ],
    product_variants: [
      variant(EAR_PAD, "p-ear", "One size", 39),
      variant(CASE_M, "p-case", "Size M", 25.5),
      variant(PILLOW, "p-pillow", "Size M", 389, { pillow_product_id: 3, item_id: null }),
      variant(SOLD_OUT, "p-out", "One size", 15),
    ],
    variant_stock: [
      { variant_id: EAR_PAD, stock_available: 5 },
      { variant_id: CASE_M, stock_available: 2 },
      { variant_id: PILLOW, stock_available: 9 },
      { variant_id: SOLD_OUT, stock_available: 0 },
    ],
    service_prices: [
      { key: "measurement_premium", msrp: 40, cost_price: 12, currency: "SGD" },
      { key: "measurement_basic", msrp: 20, cost_price: 6, currency: "SGD" },
      { key: "readjustment", msrp: 30, cost_price: 9, currency: "SGD" },
    ],
    shipping_methods: [
      {
        id: FLAT,
        slug: "standard",
        content: { "en-US": { name: "Standard delivery" } },
        base_rate: 5,
        free_above: 100,
        currency: "SGD",
        countries: ["SG"],
        is_active: true,
        position: 0,
        rate_source: "flat",
        collect_location_id: null,
      },
      {
        id: COLLECT,
        slug: "collect",
        content: { "en-US": { name: "Self-collect" } },
        base_rate: 0,
        free_above: null,
        currency: "SGD",
        countries: ["SG"],
        is_active: true,
        position: 1,
        rate_source: "flat",
        collect_location_id: STUDIO,
      },
    ],
    customer_addresses: [],
    orders: [],
    order_items: [],
    order_payment_links: [],
    order_shipments: [],
    order_timeline: [],
    email_template_copy: [],
  };
}

export const SG_ADDRESS = {
  recipient: "Ada Tan",
  line1: "1 Orchard Road",
  city: "Singapore",
  postal_code: "238824",
  country: "SG",
};
