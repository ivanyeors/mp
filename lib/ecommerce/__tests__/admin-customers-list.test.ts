import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `listAdminCustomers` reads its filters through lib/crm/customer-filters.ts
 * (CRM slice 04), so the RSC page and `GET /api/shop/customers` make the same
 * query: one escaped ilike for search, never an `or`, and a dropped value never
 * sent.
 */

const h = vi.hoisted(() => ({ calls: [] as unknown[][], table: "" }));

vi.mock("@/lib/supabase/server", () => {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "ilike", "overlaps", "contains", "eq", "is", "not", "gte", "lt", "order", "or"]) {
    builder[method] = (...args: unknown[]) => {
      h.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.range = (...args: unknown[]) => {
    h.calls.push(["range", ...args]);
    return Promise.resolve({ data: [], error: null, count: 0 });
  };
  return {
    supabaseAdmin: () => ({
      from: (table: string) => {
        h.table = table;
        return builder;
      },
    }),
  };
});

const { listAdminCustomers } = await import("@/lib/ecommerce/admin/customers");

beforeEach(() => {
  h.calls = [];
  h.table = "";
});

describe("listAdminCustomers", () => {
  it("reads the Customer overview with one escaped ilike for a search", async () => {
    const result = await listAdminCustomers(new URLSearchParams("search=Tan, Mei&page=2&limit=10"));
    expect(result).toEqual({ ok: true, rows: [], total: 0, page: 2, limit: 10 });
    expect(h.table).toBe("admin_customer_overview");
    expect(h.calls.filter(([m]) => m === "or")).toEqual([]);
    expect(h.calls).toContainEqual(["ilike", "search_text", "%Tan, Mei%"]);
    expect(h.calls.at(-1)).toEqual(["range", 10, 19]);
  });

  it("applies the CRM filters and drops an unknown value", async () => {
    await listAdminCustomers(new URLSearchParams("bought=premium&readjusted=never&last_order=soon"));
    expect(h.calls).toContainEqual(["overlaps", "bought", '{"premium"}']);
    expect(h.calls).toContainEqual(["is", "last_readjusted_at", null]);
    expect(h.calls.some(([m, col]) => col === "last_paid_at" || m === "lt")).toBe(false);
  });
});
