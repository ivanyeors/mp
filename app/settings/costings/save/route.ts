import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const BOLSTER_VARIANTS = ["short", "medium", "long"] as const;
type BolsterVariant = (typeof BOLSTER_VARIANTS)[number];

type ProductComponent = { itemId: number; quantity: number };

type ProductSummary = {
  key: string;
  kind: "pillow" | "bolster";
  productId: number | null;
  variant: BolsterVariant | null;
  costCents: number | null;
  cost: string | null;
  msrpCents: number | null;
  msrp: string | null;
};

const pillowKey = (productId: number) => `product:pillow:${productId}`;
const bolsterKey = (variant: BolsterVariant) => `product:bolster:${variant}`;

const toCents = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(numeric)) return null;
  return Math.round(numeric * 100);
};

const ProductPayloadSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(["pillow", "bolster"]),
    productId: z.number().int().positive().optional(),
    variant: z.enum(["short", "medium", "long"]).optional(),
    msrpCents: z.number().int().min(0).nullable(),
    compareAtCents: z.number().int().min(0).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "pillow") {
      if (value.productId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productId"],
          message: "productId is required for pillow products",
        });
      }
      if (value.variant !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variant"],
          message: "variant must be omitted for pillow products",
        });
      }
    } else if (value.kind === "bolster") {
      if (value.variant === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variant"],
          message: "variant is required for bolster products",
        });
      }
      if (value.productId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productId"],
          message: "productId must be omitted for bolster products",
        });
      }
    }
  });

const PayloadSchema = z.object({
  rows: z.array(
    z.object({
      itemId: z.number().int().positive(),
      costPriceCents: z.number().int().min(0).nullable(),
      msrpCents: z.number().int().min(0).nullable(),
      compareAtCents: z.number().int().min(0).nullable().optional(),
    }),
  ),
  products: z.array(ProductPayloadSchema).optional(),
});

type ProductPayload = z.infer<typeof ProductPayloadSchema>;

const toDecimalString = (value: number | null) => (value === null ? null : (value / 100).toFixed(2));

async function fetchProductSummaries(adminClient: ReturnType<typeof supabaseAdmin>): Promise<ProductSummary[]> {
  type RawItemRow = { id: number; pricing?: { cost_price: string | number | null } | Array<{ cost_price: string | number | null }> | null };
  type RawPillowRow = { id: number; size: string; kind: string | null };
  type RawBomLine = { product_id: number; item_id: number; quantity: number | string };
  type RawBolsterLine = { variant: string; item_id: number; quantity: number | string };
  type RawProductPrice = {
    key: string;
    kind: "pillow" | "bolster";
    product_id: number | null;
    variant: string | null;
    msrp: string | number | null;
  };

  const [
    { data: itemsData, error: itemsError },
    { data: pillowData, error: pillowError },
    { data: bomData, error: bomError },
    { data: bolsterData, error: bolsterError },
    { data: productPricesData, error: productPricesError },
  ] = await Promise.all([
    adminClient
      .from("items")
      .select("id,pricing:item_prices!left(cost_price)")
      .eq("is_active", true),
    adminClient.from("pillow_products").select("id,size,kind").eq("is_active", true),
    adminClient.from("bom_lines").select("product_id,item_id,quantity"),
    adminClient.from("bolster_bom_lines").select("variant,item_id,quantity"),
    adminClient.from("product_prices").select("key,kind,product_id,variant,msrp"),
  ]);

  if (itemsError) throw new Error(itemsError.message);
  if (pillowError) throw new Error(pillowError.message);
  if (bomError) throw new Error(bomError.message);
  if (bolsterError) throw new Error(bolsterError.message);
  if (productPricesError) throw new Error(productPricesError.message);

  const itemCostById = new Map<number, number | null>();
  (itemsData ?? []).forEach((row: RawItemRow) => {
    const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
    const costCents = toCents(pricing?.cost_price ?? null);
    itemCostById.set(row.id, costCents);
  });

  const bomByProduct = new Map<number, ProductComponent[]>();
  (bomData ?? []).forEach((line: RawBomLine) => {
    const productId = Number(line.product_id);
    const itemId = Number(line.item_id);
    const quantity = Number(line.quantity);
    if (!Number.isFinite(productId) || !Number.isFinite(itemId) || !Number.isFinite(quantity)) {
      return;
    }
    const list = bomByProduct.get(productId) ?? [];
    list.push({ itemId, quantity });
    bomByProduct.set(productId, list);
  });

  const bolsterByVariant: Record<BolsterVariant, ProductComponent[]> = {
    short: [],
    medium: [],
    long: [],
  };
  (bolsterData ?? []).forEach((line: RawBolsterLine) => {
    const variant = line.variant;
    if (variant !== "short" && variant !== "medium" && variant !== "long") return;
    const itemId = Number(line.item_id);
    const quantity = Number(line.quantity);
    if (!Number.isFinite(itemId) || !Number.isFinite(quantity)) return;
    bolsterByVariant[variant].push({ itemId, quantity });
  });

  const priceByProductId = new Map<number, RawProductPrice>();
  const priceByVariant = new Map<BolsterVariant, RawProductPrice>();
  (productPricesData ?? []).forEach((row: RawProductPrice) => {
    if (row.kind === "pillow" && row.product_id !== null) {
      priceByProductId.set(row.product_id, row);
    } else if (row.kind === "bolster" && row.variant && (row.variant === "short" || row.variant === "medium" || row.variant === "long")) {
      priceByVariant.set(row.variant as BolsterVariant, row);
    }
  });

  const costForComponents = (components: ProductComponent[]): number | null => {
    if (components.length === 0) return 0;
    let total = 0;
    for (const component of components) {
      const cost = itemCostById.get(component.itemId);
      if (cost === undefined || cost === null) {
        return null;
      }
      total += cost * component.quantity;
    }
    return Math.round(total);
  };

  const summaries: ProductSummary[] = [];

  (pillowData ?? []).forEach((product: RawPillowRow) => {
    const key = pillowKey(product.id);
    const components = bomByProduct.get(product.id) ?? [];
    const costCents = costForComponents(components);
    const price = priceByProductId.get(product.id);
    const msrpCents = toCents(price?.msrp ?? null);
    summaries.push({
      key,
      kind: "pillow",
      productId: product.id,
      variant: null,
      costCents,
      cost: toDecimalString(costCents),
      msrpCents,
      msrp: toDecimalString(msrpCents),
    });
  });

  BOLSTER_VARIANTS.forEach((variant) => {
    const key = bolsterKey(variant);
    const components = bolsterByVariant[variant];
    const costCents = costForComponents(components);
    const price = priceByVariant.get(variant);
    const msrpCents = toCents(price?.msrp ?? null);
    summaries.push({
      key,
      kind: "bolster",
      productId: null,
      variant,
      costCents,
      cost: toDecimalString(costCents),
      msrpCents,
      msrp: toDecimalString(msrpCents),
    });
  });

  return summaries;
}

export async function POST(req: Request) {
  let payload: z.infer<typeof PayloadSchema>;
  try {
    const json = await req.json();
    payload = PayloadSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const productRows = payload.products ?? [];

  if (payload.rows.length === 0 && productRows.length === 0) {
    return NextResponse.json({ ok: true, products: [] });
  }

  const admin = supabaseAdmin();

  const upsertRows = payload.rows
    .filter((row) => row.costPriceCents !== null || row.msrpCents !== null || row.compareAtCents !== null)
    .map((row) => ({
      item_id: row.itemId,
      cost_price: toDecimalString(row.costPriceCents),
      msrp: toDecimalString(row.msrpCents),
      compare_at_price: toDecimalString(row.compareAtCents ?? null),
    }));

  const deleteIds = payload.rows
    .filter((row) => row.costPriceCents === null && row.msrpCents === null && (row.compareAtCents ?? null) === null)
    .map((row) => row.itemId);

  try {
    if (upsertRows.length > 0) {
      const { error } = await admin.from("item_prices").upsert(upsertRows);
      if (error) throw new Error(error.message);
    }
    if (deleteIds.length > 0) {
      const { error } = await admin.from("item_prices").delete().in("item_id", deleteIds);
      if (error) throw new Error(error.message);
    }
    if (productRows.length > 0) {
      const productUpserts = productRows
        .filter((row): row is ProductPayload => row.msrpCents !== null || (row.compareAtCents ?? null) !== null)
        .map((row) => ({
          key: row.key,
          kind: row.kind,
          product_id: row.kind === "pillow" ? row.productId! : null,
          variant: row.kind === "bolster" ? row.variant! : null,
          msrp: toDecimalString(row.msrpCents),
          compare_at_price: toDecimalString(row.compareAtCents ?? null),
          currency: "USD",
        }));
      if (productUpserts.length > 0) {
        const { error } = await admin.from("product_prices").upsert(productUpserts, { onConflict: "key" });
        if (error) throw new Error(error.message);
      }
      const deleteKeys = productRows
        .filter((row) => row.msrpCents === null && (row.compareAtCents ?? null) === null)
        .map((row) => row.key);
      if (deleteKeys.length > 0) {
        const { error } = await admin.from("product_prices").delete().in("key", deleteKeys);
        if (error) throw new Error(error.message);
      }
    }
    const products = await fetchProductSummaries(admin);
    return NextResponse.json({ ok: true, products });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save pricing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


