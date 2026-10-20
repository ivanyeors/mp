import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminCustomer } from "@/lib/ecommerce/admin/customers";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { UpdateCustomerSchema, changedCustomerFields } from "@/lib/crm/customer-patch";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;

  const result = await getAdminCustomer(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, row: result.row });
}

/**
 * Saves the fields the client says changed. Only fields whose value really
 * differs are written, and the audit entry holds just those, before and after.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    return NextResponse.json(
      { error: issue ? `${field ? `${field}: ` : ""}${issue.message}` : "Invalid input" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  const { data: current, error: readError } = await admin
    .from("customers")
    .select("email, first_name, last_name, phone, locale, tags")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const changed = changedCustomerFields(current, parsed.data);
  if (Object.keys(changed.after).length === 0) {
    const result = await getAdminCustomer(id);
    return NextResponse.json({ ok: true, row: result.ok ? result.row : null });
  }

  const { data, error } = await admin
    .from("customers")
    .update(changed.after)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A customer with this email already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: "customer.update",
    entityType: "customer",
    entityId: id,
    before: changed.before,
    after: changed.after,
  });

  return NextResponse.json({ ok: true, row: data });
}
