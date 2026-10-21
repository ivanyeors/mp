import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PURCHASE_CLASSES } from "@/lib/crm/customer-overview";
import { boughtClasses, isCountedOrder, purchaseClass, purchaseLine } from "@/lib/crm/purchase-lines";
import { NOT_A_PURCHASE } from "@/lib/readjustment/purchases";
import {
  BOUGHT,
  COUNTED_STATUSES,
  CUSTOMERS,
  LINES,
  ORDERS,
  ORDER_STATUSES,
  TEST_PILLOW_IDS,
  lineRow,
} from "./purchase-lines-fixture";

/**
 * The TypeScript side of CRM slice 04's purchase classes: `classifyOrderLine`
 * read the way `customer_purchase_lines` reads it, over the fixture the
 * parity check (lib/crm/purchase-lines.check.ts) also inserts into a database.
 * Here each fixture line must mean what it says; the check then requires the
 * SQL view to say the same of every line.
 */

const pillowById = new Map([
  [TEST_PILLOW_IDS.premium, { size: "M", kind: "premium" }],
  [TEST_PILLOW_IDS.basic, { size: "M", kind: "basic" }],
]);
const orderById = new Map(ORDERS.map((o) => [o.id, o]));
const paid = (o: (typeof ORDERS)[number]) => ({ paid_at: o.paidMonthsAgo == null ? null : "2026-01-01T00:00:00Z", status: o.status });

/** What the view lists for a fixture line: nothing off a counted Order, nothing for a Service line. */
function listed(l: (typeof LINES)[number]) {
  const order = orderById.get(l.order_id)!;
  return isCountedOrder(paid(order)) ? purchaseLine(lineRow(l, TEST_PILLOW_IDS), pillowById) : null;
}

describe("purchaseLine, over the fixture", () => {
  it.each(LINES.map((l) => [l.why, l] as const))("%s", (_why, l) => {
    expect(listed(l)).toEqual(l.expect);
  });
});

describe("isCountedOrder", () => {
  it("counts a paid Order unless purchases.ts says its money never came or went back", () => {
    for (const status of ORDER_STATUSES) {
      expect(isCountedOrder({ paid_at: "2026-01-01T00:00:00Z", status }), status).toBe(COUNTED_STATUSES[status]);
      expect(NOT_A_PURCHASE.has(status), status).toBe(!COUNTED_STATUSES[status]);
    }
  });

  it("never counts an unpaid Order", () => {
    expect(isCountedOrder({ paid_at: null, status: "confirmed" })).toBe(false);
  });

  it("excludes in SQL exactly the statuses purchases.ts excludes", () => {
    // Both views write the list out; it must be NOT_A_PURCHASE, in either.
    const dir = new URL("../../../supabase/migrations/", import.meta.url);
    for (const file of ["20261020122000_customer_purchase_lines.sql", "20261020200000_customer_overview_crm_columns.sql"]) {
      const sql = readFileSync(new URL(file, dir), "utf8").replace(/--.*$/gm, "");
      const lists = [...sql.matchAll(/status not in \(([^)]*)\)/g)].map(([, l]) => l.replace(/[\s']/g, "").split(",").sort());
      expect(lists.length, file).toBeGreaterThan(0);
      for (const l of lists) expect(l, file).toEqual([...NOT_A_PURCHASE].sort());
    }
  });
});

describe("boughtClasses", () => {
  it("names each class once, in PURCHASE_CLASSES order", () => {
    expect(
      boughtClasses([
        { product_type: "accessory", tier: null },
        { product_type: "bolster", tier: null },
        { product_type: "pillow", tier: "premium" },
        { product_type: "pillow", tier: "basic" },
        { product_type: "pillow", tier: "premium" },
      ]),
    ).toEqual([...PURCHASE_CLASSES]);
  });

  it("adds nothing for a pillow of no known Tier", () => {
    expect(purchaseClass({ product_type: "pillow", tier: null })).toBeNull();
    expect(boughtClasses([{ product_type: "pillow", tier: null }])).toEqual([]);
  });

  it("gives each fixture Customer the `bought` the fixture declares", () => {
    for (const [name, c] of Object.entries(CUSTOMERS) as [keyof typeof CUSTOMERS, (typeof CUSTOMERS)[keyof typeof CUSTOMERS]][]) {
      const theirs = LINES.filter((l) => orderById.get(l.order_id)!.customer_id === c.id).map(listed);
      expect(boughtClasses(theirs.filter((l) => l !== null)), name).toEqual(BOUGHT[name]);
    }
  });
});
