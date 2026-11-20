import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOrderShippableLines } from "@/lib/shipping/lines";

describe("loadOrderShippableLines — Service fee lines are not parcels", () => {
  it("excludes kind = 'service' and keeps the build line", async () => {
    const rows = [
      {
        kind: "goods",
        variant_id: null,
        quantity: 1,
        unit_price: 360,
        sku: "RESULT-M-premium",
        product_title: "Custom Mpillow M premium",
        variant_title: "M · premium tier",
        customization_snapshot: { product_type: "pillow" },
        product_variants: null,
      },
      {
        kind: "service",
        variant_id: null,
        quantity: 1,
        unit_price: 50,
        sku: "SERVICE-MEASUREMENT-PREMIUM",
        product_title: "Measurement service (Premium)",
        variant_title: null,
        customization_snapshot: null,
        product_variants: null,
      },
    ];
    const filters: Array<[string, string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), query),
      neq: (c: string, v: unknown) => (filters.push(["neq", c, v]), query),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: rows.filter((r) =>
            filters.every(([op, c, v]) =>
              op === "neq" ? (r as Record<string, unknown>)[c] !== v : true,
            ),
          ),
          error: null,
        }).then(resolve),
    };
    const admin = { from: () => query } as unknown as SupabaseClient;

    const lines = await loadOrderShippableLines(admin, "order-1", "SGD");

    expect(filters).toContainEqual(["neq", "kind", "service"]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ product_type: "pillow", unit_value: 360 });
  });
});
