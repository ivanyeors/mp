import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CreateAddressSchema = z.object({
  label: z.string().trim().optional(),
  recipient: z.string().trim().min(1),
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().optional(),
  postal_code: z.string().trim().min(1),
  country: z.string().trim().length(2).default("MY"),
  phone: z.string().trim().optional(),
  is_default: z.boolean().optional().default(false),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateAddressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Verify the customer exists
  const { error: customerError } = await admin
    .from("customers")
    .select("id")
    .eq("id", id)
    .single();

  if (customerError) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // If this address should be default, unset all existing defaults first
  if (parsed.data.is_default) {
    const { error: unsetError } = await admin
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", id)
      .eq("is_default", true);

    if (unsetError) return NextResponse.json({ error: unsetError.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from("customer_addresses")
    .insert({ ...parsed.data, customer_id: id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}
