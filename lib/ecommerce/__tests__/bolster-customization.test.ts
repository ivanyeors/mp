import { describe, it, expect } from "vitest";
import {
  resolveCustomizationProductType,
  buildCheckoutCustomizationSnapshot,
} from "@/lib/ecommerce/customization-product-type";
import {
  isBolsterConfig,
  buildBolsterMpConfigData,
  resolveBolsterSizeAndVariant,
  type MpConfigCustomizationRow,
} from "@/lib/ecommerce/mp-config-sync";
import {
  mergeBuildLines,
  isBolsterCustomizedItem,
  isBolsterVariant,
  buildSaleDeductionTransactions,
} from "@/lib/ecommerce/inventory-deduction";
import type { ConfigLine } from "@/lib/types/customization";

const API_CREATED_BOLSTER_CONFIG = {
  product_type: "bolster" as const,
  bolster_variant: "medium" as const,
  pillow_product_id: null,
  config_lines: [
    {
      item_id: 101,
      category: "cover",
      name: "Bolster Cover M",
      quantity: 1,
      is_addon: false,
      price_delta: 0,
    },
    {
      item_id: 102,
      category: "case",
      name: "Bolster Case M",
      quantity: 1,
      is_addon: false,
      price_delta: 0,
    },
  ] satisfies ConfigLine[],
  filling_lines: [],
  total_addon_price: 0,
  summary: "Bolster: medium | Cover: cotton | Case: standard",
  cover_variant: "cotton",
  case_variant: "standard",
  llm_metadata: {
    source: "mbolster-config",
    height_cm: 172,
    sleep_position: "side",
    recommended_size: "M",
  },
};

describe("resolveCustomizationProductType", () => {
  it("returns explicit product_type when set", () => {
    expect(resolveCustomizationProductType({ product_type: "bolster", bolster_variant: "medium" })).toBe("bolster");
    expect(resolveCustomizationProductType({ product_type: "pillow", bolster_variant: null })).toBe("pillow");
  });

  it("infers bolster from bolster_variant when product_type is null", () => {
    expect(resolveCustomizationProductType({ product_type: null, bolster_variant: "long" })).toBe("bolster");
  });

  it("defaults to pillow when no bolster signals", () => {
    expect(resolveCustomizationProductType({ product_type: null, bolster_variant: null })).toBe("pillow");
  });
});

describe("buildCheckoutCustomizationSnapshot (checkout dry-run)", () => {
  it("builds a bolster snapshot matching checkout order_items shape", () => {
    const snapshot = buildCheckoutCustomizationSnapshot(API_CREATED_BOLSTER_CONFIG);

    expect(snapshot).toEqual({
      product_type: "bolster",
      bolster_variant: "medium",
      config_lines: API_CREATED_BOLSTER_CONFIG.config_lines,
      filling_lines: [],
      total_addon_price: 0,
      summary: API_CREATED_BOLSTER_CONFIG.summary,
    });
  });

  it("routes checkout validation to bolster when API config has product_type bolster", () => {
    const productType = resolveCustomizationProductType(API_CREATED_BOLSTER_CONFIG);
    expect(productType).toBe("bolster");

    const validationParams = {
      product_type: productType,
      pillow_product_id: undefined,
      bolster_variant: API_CREATED_BOLSTER_CONFIG.bolster_variant,
      filling_lines: API_CREATED_BOLSTER_CONFIG.filling_lines,
      component_quantities: API_CREATED_BOLSTER_CONFIG.config_lines,
      orderQuantity: 1,
    };

    expect(validationParams.product_type).toBe("bolster");
    expect(validationParams.bolster_variant).toBe("medium");
    expect(validationParams.filling_lines).toHaveLength(0);
  });

  it("legacy rows without product_type still infer bolster from bolster_variant", () => {
    const legacy = {
      ...API_CREATED_BOLSTER_CONFIG,
      product_type: null,
    };

    const snapshot = buildCheckoutCustomizationSnapshot(legacy);
    expect(snapshot.product_type).toBe("bolster");
  });
});

describe("isBolsterConfig", () => {
  const baseRow: MpConfigCustomizationRow = {
    pillow_product_id: 0,
    product_type: "pillow",
    bolster_variant: null,
    llm_metadata: {},
    summary: null,
    filling_lines: [],
    config_lines: [],
    cover_variant: null,
    case_variant: null,
    total_addon_price: 0,
  };

  it("returns true when product_type is bolster", () => {
    expect(isBolsterConfig({ ...baseRow, product_type: "bolster" })).toBe(true);
  });

  it("returns true when llm_metadata source includes mbolster", () => {
    expect(
      isBolsterConfig({
        ...baseRow,
        llm_metadata: { source: "mbolster-config" },
      })
    ).toBe(true);
  });

  it("returns false for pillow configs", () => {
    expect(
      isBolsterConfig({
        ...baseRow,
        product_type: "pillow",
        llm_metadata: { source: "mp-maker" },
      })
    ).toBe(false);
  });
});

describe("resolveBolsterSizeAndVariant", () => {
  it("maps bolster_variant to recommended size", () => {
    expect(
      resolveBolsterSizeAndVariant({
        pillow_product_id: 0,
        bolster_variant: "short",
        llm_metadata: {},
        summary: null,
        filling_lines: [],
        config_lines: [],
        cover_variant: null,
        case_variant: null,
        total_addon_price: 0,
      })
    ).toEqual({ recommendedSize: "S", bolsterVariant: "short" });
  });

  it("maps recommended_size in metadata to bolster variant", () => {
    expect(
      resolveBolsterSizeAndVariant({
        pillow_product_id: 0,
        bolster_variant: null,
        llm_metadata: { recommended_size: "L" },
        summary: null,
        filling_lines: [],
        config_lines: [],
        cover_variant: null,
        case_variant: null,
        total_addon_price: 0,
      })
    ).toEqual({ recommendedSize: "L", bolsterVariant: "long" });
  });

  it("derives size from height_cm when size fields are absent", () => {
    expect(
      resolveBolsterSizeAndVariant({
        pillow_product_id: 0,
        bolster_variant: null,
        llm_metadata: { height_cm: 190 },
        summary: null,
        filling_lines: [],
        config_lines: [],
        cover_variant: null,
        case_variant: null,
        total_addon_price: 0,
      })
    ).toEqual({ recommendedSize: "L", bolsterVariant: "long" });

    expect(
      resolveBolsterSizeAndVariant({
        pillow_product_id: 0,
        bolster_variant: null,
        llm_metadata: { height_cm: 165 },
        summary: null,
        filling_lines: [],
        config_lines: [],
        cover_variant: null,
        case_variant: null,
        total_addon_price: 0,
      })
    ).toEqual({ recommendedSize: "M", bolsterVariant: "medium" });
  });
});

describe("buildBolsterMpConfigData", () => {
  it("maps API-created bolster config to mp_config response payload", () => {
    const row: MpConfigCustomizationRow = {
      pillow_product_id: 0,
      product_type: "bolster",
      bolster_variant: "medium",
      llm_metadata: API_CREATED_BOLSTER_CONFIG.llm_metadata,
      summary: API_CREATED_BOLSTER_CONFIG.summary,
      filling_lines: [],
      config_lines: API_CREATED_BOLSTER_CONFIG.config_lines,
      cover_variant: "cotton",
      case_variant: "standard",
      total_addon_price: 0,
    };

    expect(buildBolsterMpConfigData(row, "Jane Doe")).toEqual({
      name: "Jane Doe",
      gender: "",
      ageGroup: "",
      bloodPressureLevel: "",
      earDiscomfortSideSleep: "",
      bedFirmness: "",
      acidReflux: "",
      shoulderLength: "",
      neckToBack: "",
      headToBack: "",
      neckLength: "",
      height: "172",
      sleep_position: "side",
      online_recommended_size: "M",
      bolster_variant: "medium",
      cover_variant: "cotton",
      case_variant: "standard",
      component_summary: API_CREATED_BOLSTER_CONFIG.summary,
    });
  });
});

describe("isBolsterCustomizedItem", () => {
  const bolsterVariant = { pillow_product_id: null };
  const pillowVariant = { pillow_product_id: 42 };

  it("detects bolster via snapshot product_type", () => {
    expect(
      isBolsterCustomizedItem(
        pillowVariant,
        { customization_id: "cfg-1", customization_snapshot: {} },
        { product_type: "bolster", bolster_variant: "medium" }
      )
    ).toBe(true);
  });

  it("detects bolster on non-pillow variant when bolster_variant is set", () => {
    expect(
      isBolsterCustomizedItem(
        bolsterVariant,
        { customization_id: "cfg-1", customization_snapshot: {} },
        { bolster_variant: "long" }
      )
    ).toBe(true);
  });

  it("rejects standard pillow items without customization", () => {
    expect(
      isBolsterCustomizedItem(
        pillowVariant,
        { customization_id: null, customization_snapshot: null },
        { product_type: "pillow" }
      )
    ).toBe(false);
  });
});

describe("isBolsterVariant", () => {
  it("accepts valid bolster variants", () => {
    expect(isBolsterVariant("short")).toBe(true);
    expect(isBolsterVariant("medium")).toBe(true);
    expect(isBolsterVariant("long")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isBolsterVariant("xl")).toBe(false);
    expect(isBolsterVariant(null)).toBe(false);
  });
});

describe("mergeBuildLines", () => {
  it("keeps chosen lines and adds the defaults nobody chose against", () => {
    const chosen = [
      { item_id: 101, quantity: 1, category: "protector" },
      { item_id: 102, quantity: 2, category: "packaging" },
    ];
    const defaults = [
      { item_id: 101, quantity: 1, category: "protector" },
      { item_id: 103, quantity: 1, category: "packaging" },
      { item_id: 104, quantity: 3, category: "packaging" },
    ];

    expect(mergeBuildLines(chosen, defaults)).toEqual([
      { item_id: 101, quantity: 1 },
      { item_id: 102, quantity: 2 },
      { item_id: 103, quantity: 1 },
      { item_id: 104, quantity: 3 },
    ]);
  });

  it("does not overwrite chosen quantities with default quantities for shared items", () => {
    expect(
      mergeBuildLines(
        [{ item_id: 101, quantity: 3, category: "protector" }],
        [{ item_id: 101, quantity: 1, category: "protector" }],
      ),
    ).toEqual([{ item_id: 101, quantity: 3 }]);
  });

  it("replaces the default cover and case with the chosen ones, by role", () => {
    const chosen = [
      { item_id: 201, quantity: 1, category: "cover" },
      { item_id: 202, quantity: 1, category: "case" },
    ];
    const defaults = [
      { item_id: 301, quantity: 1, category: "cover" },
      { item_id: 302, quantity: 1, category: "pillow_case" },
      { item_id: 303, quantity: 1, category: "pillow_protector" },
    ];

    expect(mergeBuildLines(chosen, defaults)).toEqual([
      { item_id: 201, quantity: 1 },
      { item_id: 202, quantity: 1 },
      { item_id: 303, quantity: 1 },
    ]);
  });

  it("ships the default fillings when none were chosen, and only the chosen ones otherwise", () => {
    const defaults = [
      { item_id: 401, quantity: 1, category: "bolster_case" },
      { item_id: 501, quantity: 4, category: "filling" },
    ];

    expect(mergeBuildLines([{ item_id: 402, quantity: 1, category: "case" }], defaults)).toEqual([
      { item_id: 402, quantity: 1 },
      { item_id: 501, quantity: 4 },
    ]);
    expect(mergeBuildLines([{ item_id: 502, quantity: 2, category: "filling" }], defaults)).toEqual([
      { item_id: 502, quantity: 2 },
      { item_id: 401, quantity: 1 },
    ]);
  });

  it("drops zero-quantity lines, which the ledger refuses", () => {
    expect(
      mergeBuildLines(
        [{ item_id: 101, quantity: 0, category: "protector" }],
        [
          { item_id: 101, quantity: 1, category: "protector" },
          { item_id: 102, quantity: 1, category: "packaging" },
        ],
      ),
    ).toEqual([{ item_id: 102, quantity: 1 }]);
  });
});

describe("buildSaleDeductionTransactions", () => {
  it("negates merged line quantities scaled by order quantity", () => {
    const merged = [
      { item_id: 101, quantity: 1 },
      { item_id: 102, quantity: 2 },
      { item_id: 999, quantity: 1 },
    ];

    expect(
      buildSaleDeductionTransactions(merged, 2, "order-abc", "cfg-xyz")
    ).toEqual([
      {
        item_id: 101,
        quantity_signed: -2,
        reason: "sale",
        metadata: { order_id: "order-abc", customization_id: "cfg-xyz" },
      },
      {
        item_id: 102,
        quantity_signed: -4,
        reason: "sale",
        metadata: { order_id: "order-abc", customization_id: "cfg-xyz" },
      },
      {
        item_id: 999,
        quantity_signed: -2,
        reason: "sale",
        metadata: { order_id: "order-abc", customization_id: "cfg-xyz" },
      },
    ]);
  });
});

describe("bolster checkout → deduction → mp_config pipeline (unit-level)", () => {
  it("wires API config through checkout snapshot into inventory deduction inputs", () => {
    const snapshot = buildCheckoutCustomizationSnapshot(API_CREATED_BOLSTER_CONFIG);

    const orderItem = {
      variant_id: "variant-uuid",
      quantity: 1,
      customization_id: "customization-uuid",
      customization_snapshot: snapshot,
    };

    expect(
      isBolsterCustomizedItem(
        { pillow_product_id: null },
        orderItem,
        snapshot as Record<string, unknown>
      )
    ).toBe(true);

    const merged = mergeBuildLines(
      (snapshot.config_lines as ConfigLine[]).map((l) => ({
        item_id: l.item_id,
        quantity: l.quantity,
        category: l.category,
      })),
      [{ item_id: 999, quantity: 1, category: "packaging" }]
    );

    const transactions = buildSaleDeductionTransactions(
      merged,
      orderItem.quantity,
      "order-1",
      orderItem.customization_id
    );

    expect(transactions).toHaveLength(3);
    expect(transactions.every((t) => t.quantity_signed < 0)).toBe(true);

    const mpRow: MpConfigCustomizationRow = {
      pillow_product_id: 0,
      product_type: snapshot.product_type,
      bolster_variant: snapshot.bolster_variant,
      llm_metadata: API_CREATED_BOLSTER_CONFIG.llm_metadata,
      summary: snapshot.summary,
      filling_lines: snapshot.filling_lines,
      config_lines: snapshot.config_lines,
      cover_variant: API_CREATED_BOLSTER_CONFIG.cover_variant,
      case_variant: API_CREATED_BOLSTER_CONFIG.case_variant,
      total_addon_price: snapshot.total_addon_price,
    };

    expect(isBolsterConfig(mpRow)).toBe(true);
    expect(buildBolsterMpConfigData(mpRow, "Test Customer").bolster_variant).toBe("medium");
  });
});
