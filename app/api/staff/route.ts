import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { listStaffRows } from "@/lib/staff/admin";

export const runtime = "nodejs";

const CreateStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
});

export async function GET() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  try {
    return NextResponse.json({ ok: true, rows: await listStaffRows() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("mp_staff")
    .insert({ name: parsed.data.name })
    .select("id,name,created_at,updated_at")
    .single();

  // `idx_mp_staff_name_unique` enforces uniqueness (case-insensitive).
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    const msg = isDup ? "A staff member with this name already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: isDup ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, row: data });
}

