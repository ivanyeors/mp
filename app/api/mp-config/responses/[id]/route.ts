import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

type PillowSize = "XS" | "S" | "M" | "L" | "XL";
type PillowKind = "basic" | "premium";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

function inferSizeFromMeasurements(data: Record<string, unknown>): { size: PillowSize; reasons: string[] } {
  const shoulder = toNumber(data.shoulderLength);
  if (!shoulder) return { size: "M", reasons: ["Missing shoulder length; defaulting to M"] };

  if (shoulder <= 36) return { size: "XS", reasons: [`Shoulder length ${shoulder}cm → XS`] };
  if (shoulder <= 40) return { size: "S", reasons: [`Shoulder length ${shoulder}cm → S`] };
  if (shoulder <= 46) return { size: "M", reasons: [`Shoulder length ${shoulder}cm → M`] };
  if (shoulder <= 52) return { size: "L", reasons: [`Shoulder length ${shoulder}cm → L`] };
  return { size: "XL", reasons: [`Shoulder length ${shoulder}cm → XL`] };
}

function inferKindFromQuestions(data: Record<string, unknown>): { kind: PillowKind; reasons: string[] } {
  const acidReflux = String(data.acidReflux ?? "");
  const ear = String(data.earDiscomfortSideSleep ?? "");

  const reasons: string[] = [];
  let kind: PillowKind = "basic";
  if (acidReflux === "yes") {
    kind = "premium";
    reasons.push("Acid reflux = yes → prefer premium support/loft options");
  } else if (ear === "yes") {
    kind = "premium";
    reasons.push("Ear discomfort = yes → prefer premium comfort options");
  } else {
    reasons.push("No reflux/ear discomfort flags → default to basic");
  }
  return { kind, reasons };
}

type BomLineRow = {
  quantity: string | number;
  item: {
    id: number;
    category: string;
    name: string;
    size: string | null;
    subtype: string | null;
  } | null;
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: responseRow, error: rErr } = await admin
    .from("mp_config_responses")
    .select("id,data,is_final,measured_by_type,measured_by_staff_id,source,order_id,order_item_id,created_at,updated_at")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!responseRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch linked order number if present
  let orderNumber: string | null = null;
  if (responseRow.order_id) {
    const { data: orderRow } = await admin
      .from("orders")
      .select("order_number")
      .eq("id", responseRow.order_id)
      .maybeSingle();
    orderNumber = orderRow?.order_number ?? null;
  }

  const data = (responseRow.data ?? {}) as Record<string, unknown>;
  const sizeGuess = inferSizeFromMeasurements(data);
  const kindGuess = inferKindFromQuestions(data);

  // Try to find an active product matching the recommendation; if missing, fall back to basic.
  const tryFindProduct = async (kind: PillowKind) => {
    return await admin
      .from("pillow_products")
      .select("id,size,kind,is_active")
      .eq("size", sizeGuess.size)
      .eq("kind", kind)
      .eq("is_active", true)
      .maybeSingle();
  };

  const { data: productPreferred, error: pErr1 } = await tryFindProduct(kindGuess.kind);
  if (pErr1) return NextResponse.json({ error: pErr1.message }, { status: 500 });

  let product = productPreferred as { id: number; size: PillowSize; kind: PillowKind } | null;
  const productReasons: string[] = [];
  if (!product && kindGuess.kind === "premium") {
    const { data: fallback, error: pErr2 } = await tryFindProduct("basic");
    if (pErr2) return NextResponse.json({ error: pErr2.message }, { status: 500 });
    if (fallback) {
      product = fallback as { id: number; size: PillowSize; kind: PillowKind };
      productReasons.push("Preferred premium product not available; fell back to basic for this size");
    }
  }

  let bomLines: BomLineRow[] = [];
  if (product?.id) {
    const { data: lines, error: bErr } = await admin
      .from("bom_lines")
      .select("quantity,item:items(id,category,name,size,subtype)")
      .eq("product_id", product.id);
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
    bomLines = (lines ?? []) as unknown as BomLineRow[];
  }

  return NextResponse.json({
    ok: true,
    response: responseRow,
    order_number: orderNumber,
    suggestion: {
      recommended: {
        size: sizeGuess.size,
        kind: kindGuess.kind,
      },
      product: product ? { id: product.id, size: product.size, kind: product.kind } : null,
      bom: bomLines,
      reasons: [...sizeGuess.reasons, ...kindGuess.reasons, ...productReasons],
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("mp_config_responses").delete().eq("id", parsedParams.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

