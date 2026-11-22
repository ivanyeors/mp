import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  exitCodes: [] as number[],
  logs: [] as string[],
  errors: [] as string[],
  sync: vi.fn(),
  readErrors: {} as Record<string, { message: string }>,
  failedReads: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve(
            h.readErrors[table]
              ? { data: null, error: h.readErrors[table] }
              : {
                  data: [{ id: "p1", slug: "ear-pad", product_id: "p1", option1: "S", price: 25, compare_at_price: null }],
                  error: null,
                },
          ),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/stripe/mode", () => ({ stripeMode: () => "test" }));
vi.mock("@/lib/shop/price-sync", () => ({
  loadCostingsPriceMaps: vi.fn(async () => ({
    priceByKey: new Map(),
    priceByPillowProduct: new Map(),
    priceByBolsterVariant: new Map(),
    priceByItem: new Map(),
    failedReads: h.failedReads,
  })),
  resolveVariantPrice: () => 29,
  resolveVariantCompareAt: () => null,
  syncVariantPricesFromCostings: h.sync,
}));

const realExit = process.exit;
const realArgv = process.argv;
process.exit = ((code?: number) => {
  h.exitCodes.push(code ?? 0);
  if (h.exitCodes.length === 1) throw new Error("exit");
}) as never;
vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void h.logs.push(a.join(" ")));
vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void h.errors.push(a.join(" ")));
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stand-in";
process.env.STRIPE_SECRET_KEY = "sk_test_stand_in";

afterAll(() => {
  process.exit = realExit;
  process.argv = realArgv;
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  h.exitCodes = [];
  h.logs = [];
  h.errors = [];
  h.readErrors = {};
  h.failedReads = [];
  process.exitCode = 0;
  process.argv = [...realArgv];
});

async function runToExit() {
  await import("@/scripts/costings-sync-prices");
  await vi.waitFor(() => expect(h.exitCodes.length).toBeGreaterThan(0));
}

async function runApply() {
  process.argv = [...realArgv, "--apply"];
  await import("@/scripts/costings-sync-prices");
  await vi.waitFor(() => expect(h.sync).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
}

describe("costings-sync-prices with a failed read", () => {
  it.each([
    ["a Costings read", () => void (h.failedReads = ["bom_lines (statement timeout)"]), "bom_lines (statement timeout)"],
    ["the products read", () => void (h.readErrors.products = { message: "statement timeout" }), "products (statement timeout)"],
    [
      "the product_variants read",
      () => void (h.readErrors.product_variants = { message: "statement timeout" }),
      "product_variants (statement timeout)",
    ],
  ])("%s: names the read, prints no diff, writes nothing and exits 1", async (_name, fail, named) => {
    fail();
    await runToExit();

    expect(h.exitCodes[0]).toBe(1);
    expect(h.errors[0]).toContain(`Couldn't read ${named}`);
    expect(h.logs.join("\n")).not.toMatch(/CHANGE|UNRESOLVED|ok {10}|change\(s\)/);
    expect(h.sync).not.toHaveBeenCalled();
  });
});

describe("costings-sync-prices --apply exit code", () => {
  it("prints a notice but still exits 0 when a notice is the only problem", async () => {
    h.sync.mockResolvedValue({
      productId: "p1",
      synced: 1,
      unresolvable: [],
      problems: [{ message: "Stripe payment link plink_1 was deactivated", notice: true }],
    });
    await runApply();

    expect(h.errors.join("\n")).toContain("ear-pad: Stripe payment link plink_1 was deactivated");
    expect(h.exitCodes).toEqual([]);
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 when a problem is not a notice", async () => {
    h.sync.mockResolvedValue({
      productId: "p1",
      synced: 1,
      unresolvable: [],
      problems: [
        { message: "Stripe payment link plink_1 was deactivated", notice: true },
        { message: "Couldn't sync to Stripe: rate limited", next: { kind: "sync-to-stripe" } },
      ],
    });
    await runApply();

    expect(h.errors.join("\n")).toContain("ear-pad: Couldn't sync to Stripe: rate limited");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
