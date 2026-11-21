import { afterAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  exitCodes: [] as number[],
  logs: [] as string[],
  errors: [] as string[],
  sync: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data: [{ id: "p1", slug: "ear-pad", product_id: "p1", option1: "S", price: 25, compare_at_price: null }],
            error: null,
          }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/stripe/mode", () => ({ stripeMode: () => "test" }));
vi.mock("@/lib/shop/price-sync", () => ({
  loadCostingsPriceMaps: vi.fn().mockResolvedValue({
    priceByKey: new Map(),
    priceByPillowProduct: new Map(),
    priceByBolsterVariant: new Map(),
    priceByItem: new Map(),
    failedReads: ["bom_lines (statement timeout)"],
  }),
  resolveVariantPrice: () => 29,
  resolveVariantCompareAt: () => null,
  syncVariantPricesFromCostings: h.sync,
}));

const realExit = process.exit;
process.exit = ((code?: number) => {
  h.exitCodes.push(code ?? 0);
  if (h.exitCodes.length === 1) throw new Error("exit");
}) as never;
vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void h.logs.push(a.join(" ")));
vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void h.errors.push(a.join(" ")));
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stand-in";

afterAll(() => {
  process.exit = realExit;
});

describe("costings-sync-prices dry run with a failed Costings read", () => {
  it("names the failed read, prints no diff, writes nothing and exits 1", async () => {
    await import("@/scripts/costings-sync-prices");
    await vi.waitFor(() => expect(h.exitCodes.length).toBeGreaterThan(0));

    expect(h.exitCodes[0]).toBe(1);
    expect(h.errors[0]).toMatch(/Couldn't read Costings: bom_lines \(statement timeout\)/);
    expect(h.logs.join("\n")).not.toMatch(/CHANGE|UNRESOLVED|ok {10}|change\(s\)/);
    expect(h.sync).not.toHaveBeenCalled();
  });
});
