import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as unknown[][], table: "" }));

vi.mock("@/lib/supabase/server", () => {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "ilike", "overlaps", "contains", "eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte", "order", "or"]) {
    builder[method] = (...args: unknown[]) => {
      h.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.range = (...args: unknown[]) => {
    h.calls.push(["range", ...args]);
    return Promise.resolve({ data: [], error: null, count: 0 });
  };
  builder.then = (resolve: unknown) => {
    h.calls.push(["then"]);
    return Promise.resolve({ count: 4, error: null }).then(resolve as (v: unknown) => unknown);
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
    expect(result).toEqual({ ok: true, rows: [], total: 0, page: 2, limit: 10, shipsToUnknown: null });
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

  it("with Ships to Singapore, also counts who matches the rest but ships to an unknown country", async () => {
    const result = await listAdminCustomers(new URLSearchParams("ships_to=sg&stage=at-risk"));
    expect(result).toMatchObject({ ok: true, shipsToUnknown: 4 });
    expect(h.calls).toContainEqual(["eq", "ship_country", "SG"]);
    expect(h.calls).toContainEqual(["select", "id", { count: "exact", head: true }]);
    const head = h.calls.findIndex((c) => c[0] === "select" && c[1] === "id");
    const countCalls = h.calls.slice(head);
    expect(countCalls).toContainEqual(["in", "lifecycle_stage", ["at_risk"]]);
    expect(countCalls).toContainEqual(["is", "ship_country", null]);
    expect(countCalls).not.toContainEqual(["eq", "ship_country", "SG"]);
  });

  it("counts no Unknown for Ships to: unknown itself", async () => {
    const result = await listAdminCustomers(new URLSearchParams("ships_to=unknown"));
    expect(result).toMatchObject({ ok: true, shipsToUnknown: null });
    expect(h.calls.filter(([m]) => m === "then")).toEqual([]);
  });
});
