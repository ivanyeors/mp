import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const CreateCustomerSchema = z.object({
  email: z.string().trim().email(),
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  locale: z.string().optional().default("en-US"),
  tags: z.array(z.string()).optional().default([]),
  // No `notes`: they are Customer notes now (customer_notes), and
  // customers.notes is never written (ADR 0028 (a)).
});

export async function GET(req: Request) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);

  const result = await listAdminCustomers(searchParams);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin.from("customers").insert(parsed.data).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A customer with this email already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}
