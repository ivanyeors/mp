import { existsSync, readFileSync } from "node:fs";
import { resolve } from "path";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { ConfigLine, FillingLine } from "@/lib/types/customization";
import {
  buildCustomizeApplyPayload,
  resolveBolsterVariant,
  type CustomizeApplyRecommendation,
} from "@/lib/shop/customize-apply-payload";

/**
 * Minimal `.env.local` loader — avoids a `dotenv` dependency for this one
 * integration test file. Only fills vars that aren't already set.
 */
function loadDotEnvLocal(path: string) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadDotEnvLocal(resolve(process.cwd(), ".env.local"));

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

type MockRow = Record<string, unknown>;

function createSupabaseMock(tables: Record<string, MockRow[]>) {
  return () => ({
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: { eq: [string, unknown][]; in: [string, unknown[]][] } = {
        eq: [],
        in: [],
      };

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.eq.push([column, value]);
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.in.push([column, values]);
          return builder;
        },
        rows() {
          let filtered = [...rows];
          for (const [col, val] of filters.eq) {
            filtered = filtered.filter((row) => row[col] === val);
          }
          for (const [col, vals] of filters.in) {
            filtered = filtered.filter((row) => vals.includes(row[col] as never));
          }
          return filtered;
        },
        maybeSingle() {
          return Promise.resolve({ data: builder.rows()[0] ?? null, error: null });
        },
        then(
          onFulfilled?: (value: { data: MockRow[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const result = { data: builder.rows(), error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  });
}

let mockTables: Record<string, MockRow[]> = {};

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => createSupabaseMock(mockTables)(),
}));

import {
  validateCustomizationConfig,
  validateBolsterConfig,
  getBolsterBaseQuantities,
} from "@/lib/shop/customization-inventory";

const coverLine: ConfigLine = {
  item_id: 101,
  category: "cover",
  name: "Bolster Cover",
  quantity: 1,
  is_addon: false,
  price_delta: 10,
};

const fillingLine: FillingLine = {
  item_id: 201,
  subtype: "3D-S",
  name: "3D Soft",
  quantity: 2,
};

function makeRecommendation(
  overrides: Partial<CustomizeApplyRecommendation> = {},
): CustomizeApplyRecommendation {
  return {
    recommendation: {
      recommended_size: "M",
    },
    pillow_product: { id: 42 },
    variant: {
      id: "variant-uuid",
      product_id: "ecom-prod-uuid",
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockTables = {};
});

describe("validateCustomizationConfig routing", () => {
  it("returns invalid when bolster is missing bolster_variant", async () => {
    const result = await validateCustomizationConfig({
      product_type: "bolster",
      filling_lines: [],
      component_quantities: [],
      orderQuantity: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.shortages[0]?.name).toBe("Missing bolster_variant");
  });

  it("returns invalid when pillow is missing pillow_product_id", async () => {
    const result = await validateCustomizationConfig({
      product_type: "pillow",
      filling_lines: [fillingLine],
      component_quantities: [],
      orderQuantity: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.shortages[0]?.name).toBe("Missing pillow_product_id");
  });

  it("routes bolster configs to validateBolsterConfig", async () => {
    mockTables = {
      inventory_balances: [{ item_id: 101, on_hand: 5 }],
      items: [{ id: 101, name: "Bolster Cover", subtype: null }],
    };

    const result = await validateCustomizationConfig({
      product_type: "bolster",
      bolster_variant: "medium",
      filling_lines: [],
      component_quantities: [coverLine],
      orderQuantity: 1,
    });

    expect(result.valid).toBe(true);
    expect(result.shortages).toEqual([]);
  });

  it("routes pillow configs to validateFullConfig", async () => {
    mockTables = {
      inventory_balances: [{ item_id: 201, on_hand: 10 }],
      items: [{ id: 201, name: "3D Soft", subtype: "3D-S" }],
    };

    const result = await validateCustomizationConfig({
      product_type: "pillow",
      pillow_product_id: 42,
      filling_lines: [fillingLine],
      component_quantities: [],
      orderQuantity: 1,
    });

    expect(result.valid).toBe(true);
    expect(result.shortages).toEqual([]);
  });
});

describe("validateBolsterConfig", () => {
  it("uses explicit component quantities and reports shortages", async () => {
    mockTables = {
      inventory_balances: [{ item_id: 101, on_hand: 0 }],
      items: [{ id: 101, name: "Bolster Cover", subtype: null }],
    };

    const result = await validateBolsterConfig("short", [coverLine], 2);

    expect(result.valid).toBe(false);
    expect(result.shortages).toEqual([
      {
        item_id: 101,
        name: "Bolster Cover",
        needed: 2,
        available: 0,
      },
    ]);
  });

  it("falls back to bolster_bom_lines when no non-filling components are provided", async () => {
    mockTables = {
      bolster_bom_lines: [
        {
          variant: "long",
          item_id: 301,
          quantity: 1,
          items: { category: "cover" },
        },
        {
          variant: "long",
          item_id: 302,
          quantity: 1,
          items: { category: "filling" },
        },
      ],
      inventory_balances: [
        { item_id: 301, on_hand: 3 },
        { item_id: 302, on_hand: 99 },
      ],
      items: [
        { id: 301, name: "Long Cover", subtype: null },
        { id: 302, name: "Filling", subtype: "6D-L" },
      ],
    };

    const result = await validateBolsterConfig("long", [], 1);

    expect(result.valid).toBe(true);
    expect(result.shortages).toEqual([]);
  });

  it("returns valid when no items are needed", async () => {
    const result = await validateBolsterConfig("medium", [], 1);

    expect(result.valid).toBe(true);
    expect(result.shortages).toEqual([]);
  });

  it("checks the length's default fillings, which ship with every shop bolster", async () => {
    mockTables = {
      bolster_bom_lines: [{ variant: "medium", item_id: 301, quantity: 1, items: { category: "bolster_case" } }],
      bolster_length_config: [{ variant: "medium", default_filling_template_id: 77 }],
      bom_templates: [{ id: 77, kind: "bolster" }],
      bolster_template_placements: [
        { template_id: 77, item_id: 401 },
        { template_id: 77, item_id: 401 },
      ],
      bom_template_lines: [],
      inventory_balances: [
        { item_id: 301, on_hand: 5 },
        { item_id: 401, on_hand: 1 },
      ],
      items: [
        { id: 301, name: "Bolster Case M", subtype: null },
        { id: 401, name: "6D", subtype: "6D-L" },
      ],
    };

    const result = await validateBolsterConfig("medium", [], 1);

    expect(result.valid).toBe(false);
    expect(result.shortages).toEqual([{ item_id: 401, name: "6D (6D-L)", needed: 2, available: 1 }]);
  });

  it("checks a chosen cover instead of the default one, plus the rest of the recipe", async () => {
    mockTables = {
      bolster_bom_lines: [
        { variant: "short", item_id: 300, quantity: 1, items: { category: "cover" } },
        { variant: "short", item_id: 302, quantity: 1, items: { category: "bolster_protector" } },
      ],
      inventory_balances: [
        { item_id: 101, on_hand: 5 },
        { item_id: 300, on_hand: 0 },
        { item_id: 302, on_hand: 0 },
      ],
      items: [
        { id: 101, name: "Bolster Cover", subtype: null },
        { id: 302, name: "Bolster Protector S", subtype: null },
      ],
    };

    const result = await validateBolsterConfig("short", [coverLine], 1);

    expect(result.needed).toEqual(new Map([[101, 1], [302, 1]]));
    expect(result.shortages.map((s) => s.item_id)).toEqual([302]);
  });
});

describe("getBolsterBaseQuantities", () => {
  it("maps bolster_bom_lines rows into a quantity map", async () => {
    mockTables = {
      bolster_bom_lines: [
        { variant: "medium", item_id: 11, quantity: 1 },
        { variant: "medium", item_id: 12, quantity: 2 },
        { variant: "short", item_id: 99, quantity: 5 },
      ],
    };

    const quantities = await getBolsterBaseQuantities("medium");

    expect(quantities.get(11)).toBe(1);
    expect(quantities.get(12)).toBe(2);
    expect(quantities.has(99)).toBe(false);
  });
});

describe("resolveBolsterVariant (S/M/L mapping)", () => {
  it("maps recommended_size S/M/L to short/medium/long", () => {
    expect(
      resolveBolsterVariant(
        makeRecommendation({
          recommendation: { recommended_size: "S" },
        }),
      ),
    ).toBe("short");

    expect(
      resolveBolsterVariant(
        makeRecommendation({
          recommendation: { recommended_size: "M" },
        }),
      ),
    ).toBe("medium");

    expect(
      resolveBolsterVariant(
        makeRecommendation({
          recommendation: { recommended_size: "L" },
        }),
      ),
    ).toBe("long");
  });

  it("prefers explicit bolster_variant over size mapping", () => {
    expect(
      resolveBolsterVariant(
        makeRecommendation({
          bolster_variant: "long",
          recommendation: { recommended_size: "S" },
        }),
      ),
    ).toBe("long");
  });
});

describe("buildCustomizeApplyPayload", () => {
  const componentLines: ConfigLine[] = [
    coverLine,
    {
      item_id: 102,
      category: "case",
      name: "Bolster Case",
      quantity: 1,
      is_addon: false,
      price_delta: 0,
    },
  ];

  it("produces bolster shape with empty filling_lines and no pillow_product_id", () => {
    const payload = buildCustomizeApplyPayload({
      productType: "bolster",
      recommendation: makeRecommendation({
        bolster_variant: "medium",
        recommendation: { recommended_size: "M" },
      }),
      fillingLines: [fillingLine],
      componentLines,
      selectedCover: 999,
      selectedCase: 888,
      selectedUpsells: new Set(),
      selectedTemplateId: null,
      llmMetadata: { source: "test" },
    });

    expect(payload).toMatchObject({
      product_type: "bolster",
      bolster_variant: "medium",
      filling_lines: [],
      cover_variant: "Bolster Cover",
      case_variant: "Bolster Case",
      ecom_product_id: "ecom-prod-uuid",
    });
    expect(payload).not.toHaveProperty("pillow_product_id");
  });

  it("produces pillow shape with pillow_product_id and filling_lines", () => {
    const payload = buildCustomizeApplyPayload({
      productType: "pillow",
      recommendation: makeRecommendation(),
      fillingLines: [fillingLine],
      componentLines: [],
      selectedCover: 55,
      selectedCase: 66,
      selectedUpsells: new Set(),
      selectedTemplateId: 7,
      llmMetadata: {},
    });

    expect(payload.product_type).toBe("pillow");
    expect(payload).toHaveProperty("pillow_product_id", 42);
    expect(payload.filling_lines).toEqual([fillingLine]);
    expect(payload).not.toHaveProperty("bolster_variant");
    expect(payload.cover_variant).toBe("55");
    expect(payload.case_variant).toBe("66");
  });
});

describe.skipIf(!hasSupabaseEnv)("integration with real Supabase", () => {
  beforeAll(async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
  });

  it(
    "getBolsterBaseQuantities reads bolster_bom_lines for each variant",
    async () => {
      const { getBolsterBaseQuantities: getBase } = await import(
        "@/lib/shop/customization-inventory"
      );

      for (const variant of ["short", "medium", "long"] as const) {
        const map = await getBase(variant);
        expect(map.size).toBeGreaterThan(0);
      }
    },
    15000,
  );

  it(
    "validateBolsterConfig succeeds against live inventory for medium variant",
    async () => {
      const { getBolsterBaseQuantities: getBase, validateBolsterConfig: validate } =
        await import("@/lib/shop/customization-inventory");

      const base = await getBase("medium");
      const component_quantities: ConfigLine[] = [...base.entries()].map(
        ([item_id, quantity]) => ({
          item_id,
          category: "cover",
          name: `Item ${item_id}`,
          quantity,
          is_addon: false,
          price_delta: 0,
        }),
      );

      const result = await validate("medium", component_quantities, 1);
      expect(result.valid).toBe(true);
    },
    15000,
  );
});
