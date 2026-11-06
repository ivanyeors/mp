import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { loadCustomerPillow } from "../load";
import { loadOwnPillow } from "../own";

/**
 * ADR 0042 k: the customer sees their pillow on their own Profile once
 * something says they bought it: a pillow bought here (drawn as it was built),
 * a Staff link, or a fitting with a Shopify order. What reaches them is copied
 * to what is theirs. Every name, id and figure here is made up; the template
 * names follow the catalog's.
 */

const CUSTOMER = "aaaaaaaa-0000-4000-8000-000000000001";
let db: FakeDb;
const admin = () => fakeSupabaseAdmin(db) as unknown as SupabaseClient;

const fitting = {
  id: "f-1",
  fittedAt: "2025-06-01T02:00:00.000Z",
  recommendedSize: "L",
  configurationType: "T12",
  profileSide: "L-LN",
};

const cell = (templateId: number, slot: number, itemId: number) => ({
  template_id: templateId,
  section: "center",
  sub_section: "middle",
  slot,
  item_id: itemId,
  row_index: null,
  insert_order: null,
  offset_x_mm: null,
  offset_y_mm: null,
});

/** A counted Order here with one Custom Mpillow line, its build frozen on it. */
function buyHere(id: string, paidAt: string, over: Record<string, unknown> = {}) {
  db.orders.push({ id: `o-${id}`, order_number: `MP-${id}`, customer_id: CUSTOMER });
  db.customer_purchase_lines.push({
    customer_id: CUSTOMER,
    order_id: `o-${id}`,
    order_item_id: `i-${id}`,
    paid_at: paidAt,
    product_type: "pillow",
    tier: "premium",
    size: "M",
  });
  db.order_items.push({
    id: `i-${id}`,
    order_id: `o-${id}`,
    quantity: 1,
    returned_quantity: 0,
    customization_snapshot: {
      result_id: `res-${id}`,
      product_type: "pillow",
      assigned_size: "M",
      assigned_tier: "premium",
      filling_template_id: 57,
      filling_template_name: "Type-12 (as built)",
      filling_placements: [{ section: "left", sub_section: "front", slot: 1, item_id: 69, row_index: null, insert_order: 1 }],
      build_lines: [],
      cogs: 92,
    },
    ...over,
  });
}

beforeEach(() => {
  db = {
    customers: [{ id: CUSTOMER, email: "jamie@example.test" }],
    bom_templates: [{ id: 57, name: "Type-12", key: "L", kind: "pillow", role: "filling", is_active: true }],
    bom_template_keys: [
      { template_id: 57, key: "L" },
      { template_id: 57, key: "XL" },
    ],
    filling_template_placements: [cell(57, 1, 67), cell(57, 2, 68)],
    items: [
      { id: 67, name: "6D S", subtype: "6D", size: "S", category: "filling", cost_price: 4.2 },
      { id: 68, name: "6D M", subtype: "6D", size: "M", category: "filling", cost_price: 5.1 },
      { id: 69, name: "3D S", subtype: "3D", size: "S", category: "filling", cost_price: 3.3 },
    ],
    mp_staff: [{ id: "p-sophie", name: "Sophie" }],
    customer_pillows: [],
    customer_purchase_lines: [],
    order_items: [],
    orders: [],
    migrated_customers: [],
  };
});

describe("a pillow bought here", () => {
  it("is drawn as its line froze it, by the name it had, for the order it was built for", async () => {
    buyHere("1001", "2026-10-20T04:00:00.000Z");
    const own = await loadOwnPillow(admin(), CUSTOMER, []);
    expect(own).toEqual({
      source: "order",
      size: "M",
      name: "Type-12 (as built)",
      orderNumber: "MP-1001",
      date: "2026-10-20T04:00:00.000Z",
      placements: [
        { section: "left", sub_section: "front", slot: 1, item_id: 69, row_index: null, insert_order: 1, offset_x_mm: null, offset_y_mm: null },
      ],
      items: [{ id: 69, name: "3D S", subtype: "3D", size: "S", category: "filling" }],
      colorOverrides: [],
      dimensionOverrides: expect.anything(),
    });
  });

  it("wins over the fitting, on the Customer page too", async () => {
    buyHere("1001", "2026-10-20T04:00:00.000Z");
    const read = await loadCustomerPillow(admin(), CUSTOMER, [fitting]);
    expect(read.ok && read.pillow).toMatchObject({
      source: "order",
      template: { id: 57, name: "Type-12 (as built)", keys: ["L", "XL"] },
      order: { orderNumber: "MP-1001", size: "M", templateName: "Type-12 (as built)" },
      fitting: { id: "f-1" },
      ownership: "bought_here",
      onProfile: true,
    });
  });

  it("is not theirs once returned, and the fitting alone shows nothing on the Profile", async () => {
    buyHere("1001", "2026-10-20T04:00:00.000Z", { returned_quantity: 1 });
    expect(await loadOwnPillow(admin(), CUSTOMER, [fitting])).toBeNull();
    const read = await loadCustomerPillow(admin(), CUSTOMER, [fitting]);
    expect(read.ok && read.pillow).toMatchObject({ source: "fitting", ownership: null, onProfile: false });
  });
});

describe("a customer from before this platform", () => {
  it("sees the fitting's pillow when they have a Shopify order", async () => {
    db.migrated_customers.push({ customer_id: CUSTOMER, shopify_orders_count: 2 });
    expect(await loadOwnPillow(admin(), CUSTOMER, [fitting])).toMatchObject({
      source: "fitting",
      size: "L",
      name: "Type-12",
      orderNumber: null,
      date: "2025-06-01T02:00:00.000Z",
      placements: [{ item_id: 67 }, { item_id: 68 }],
    });
  });

  it("sees nothing with a fitting and no Shopify order, or Shopify orders and no fitting", async () => {
    db.migrated_customers.push({ customer_id: CUSTOMER, shopify_orders_count: 0 });
    expect(await loadOwnPillow(admin(), CUSTOMER, [fitting])).toBeNull();
    db.migrated_customers = [{ customer_id: CUSTOMER, shopify_orders_count: 3 }];
    expect(await loadOwnPillow(admin(), CUSTOMER, [])).toBeNull();
  });
});

describe("a Staff link", () => {
  beforeEach(() => {
    db.customer_pillows.push({
      customer_id: CUSTOMER,
      pillow_size: "XL",
      filling_template_id: 57,
      linked_by_profile_id: "p-sophie",
      linked_at: "2026-11-01T00:00:00.000Z",
    });
  });

  it("shows on their Profile, without who linked it or anything else Staff see", async () => {
    const own = await loadOwnPillow(admin(), CUSTOMER, [fitting]);
    expect(own).toMatchObject({ source: "linked", size: "XL", name: "Type-12", date: null, orderNumber: null });
    expect(Object.keys(own ?? {}).sort()).toEqual(
      ["colorOverrides", "date", "dimensionOverrides", "items", "name", "orderNumber", "placements", "size", "source"].sort(),
    );
    expect(JSON.stringify(own)).not.toMatch(/Sophie|T12|L-LN|cost_price/);
  });

  it("still wins over a pillow bought after it, which the Customer page names", async () => {
    buyHere("1002", "2026-11-03T00:00:00.000Z");
    const read = await loadCustomerPillow(admin(), CUSTOMER, [fitting]);
    expect(read.ok && read.pillow).toMatchObject({
      source: "linked",
      size: "XL",
      order: { orderNumber: "MP-1002", paidAt: "2026-11-03T00:00:00.000Z" },
      ownership: "bought_here",
    });
  });

  it("of a size alone draws nothing, so the Profile shows nothing", async () => {
    db.customer_pillows[0].filling_template_id = null;
    expect(await loadOwnPillow(admin(), CUSTOMER, [fitting])).toBeNull();
  });
});
