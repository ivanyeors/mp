import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { normalizePhone } from "@/lib/appointments/phone";
import { findCustomerByEmail } from "@/lib/ecommerce/customers";

export const runtime = "nodejs";

const CreateCustomerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  first_name: z.string().trim().min(1).max(120).optional(),
  last_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  locale: z.string().optional().default("en-US"),
  tags: z.array(z.string()).optional().default([]),
});

const FIELD_ERRORS: Record<string, string> = {
  email: "An email is needed to create a customer.",
  phone: "That mobile number doesn't look right.",
};

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
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return NextResponse.json(
      { error: FIELD_ERRORS[field] ?? parsed.error.issues[0]?.message ?? "Invalid input", field },
      { status: 400 },
    );
  }

  const { phone: typedPhone, ...fields } = parsed.data;
  const phone = typedPhone ? normalizePhone(typedPhone) : null;
  if (typedPhone && !phone) {
    return NextResponse.json({ error: FIELD_ERRORS.phone, field: "phone" }, { status: 400 });
  }

  const existing = await findCustomerByEmail(fields.email);
  if (existing) return NextResponse.json({ ok: true, row: existing, created: false });

  const { data, error } = await supabaseAdmin()
    .from("customers")
    .insert({ ...fields, ...(phone ? { phone } : {}) })
    .select("*")
    .single();
  if (error) {
    const raced = await findCustomerByEmail(fields.email);
    if (raced) return NextResponse.json({ ok: true, row: raced, created: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: "customer.create",
    entityType: "customer",
    entityId: data.id,
    before: null,
    after: { ...fields, phone },
  });

  return NextResponse.json({ ok: true, row: data, created: true });
}
