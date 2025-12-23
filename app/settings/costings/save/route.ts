import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const ProductPayloadSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(["pillow", "bolster"]),
    productId: z.number().int().positive().optional(),
    variant: z.enum(["short", "medium", "long"]).optional(),
    msrpCents: z.number().int().min(0).nullable(),
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
    }),
  ),
  products: z.array(ProductPayloadSchema).optional(),
});

type ProductPayload = z.infer<typeof ProductPayloadSchema>;

const toDecimalString = (value: number | null) => (value === null ? null : (value / 100).toFixed(2));

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
    return NextResponse.json({ ok: true });
  }

  const admin = supabaseAdmin();

  const upsertRows = payload.rows
    .filter((row) => row.costPriceCents !== null || row.msrpCents !== null)
    .map((row) => ({
      item_id: row.itemId,
      cost_price: toDecimalString(row.costPriceCents),
      msrp: toDecimalString(row.msrpCents),
    }));

  const deleteIds = payload.rows
    .filter((row) => row.costPriceCents === null && row.msrpCents === null)
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
        .filter((row): row is ProductPayload & { msrpCents: number } => row.msrpCents !== null)
        .map((row) => ({
          key: row.key,
          kind: row.kind,
          product_id: row.kind === "pillow" ? row.productId! : null,
          variant: row.kind === "bolster" ? row.variant! : null,
          msrp: toDecimalString(row.msrpCents),
          currency: "USD",
        }));
      if (productUpserts.length > 0) {
        const { error } = await admin.from("product_prices").upsert(productUpserts, { onConflict: "key" });
        if (error) throw new Error(error.message);
      }
      const deleteKeys = productRows.filter((row) => row.msrpCents === null).map((row) => row.key);
      if (deleteKeys.length > 0) {
        const { error } = await admin.from("product_prices").delete().in("key", deleteKeys);
        if (error) throw new Error(error.message);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save pricing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


