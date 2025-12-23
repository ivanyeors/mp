import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const PayloadSchema = z.object({
  rows: z.array(
    z.object({
      itemId: z.number().int().positive(),
      costPriceCents: z.number().int().min(0).nullable(),
      msrpCents: z.number().int().min(0).nullable(),
    }),
  ),
});

const toDecimalString = (value: number | null) => (value === null ? null : (value / 100).toFixed(2));

export async function POST(req: Request) {
  let payload: z.infer<typeof PayloadSchema>;
  try {
    const json = await req.json();
    payload = PayloadSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.rows.length === 0) {
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save pricing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


