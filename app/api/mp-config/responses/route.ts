import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const YesNoEmptySchema = z.union([z.literal("yes"), z.literal("no"), z.literal("")]);

const MeasurementSchema = z.object({
  name: z.string().default(""),
  gender: z.string().default(""),
  ageGroup: z.string().default(""),
  bloodPressureLevel: z.string().default(""),
  earDiscomfortSideSleep: YesNoEmptySchema.default(""),
  bedFirmness: z.string().default(""),
  acidReflux: YesNoEmptySchema.default(""),
  shoulderLength: z.string().default(""),
  neckToBack: z.string().default(""),
  headToBack: z.string().default(""),
  neckLength: z.string().default(""),
});

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  data: MeasurementSchema,
  isFinal: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = parsed.data.id ?? crypto.randomUUID();
  const row: { id: string; data: unknown; is_final?: boolean } = { id, data: parsed.data.data };
  if (typeof parsed.data.isFinal === "boolean") row.is_final = parsed.data.isFinal;

  const admin = supabaseAdmin();
  const { error } = await admin.from("mp_config_responses").upsert(row, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}

