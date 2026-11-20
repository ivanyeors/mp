import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext, type AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { normalizePhone } from "@/lib/appointments/phone";
import { findOrCreateCustomerId, newCustomerFields } from "@/lib/crm/customisation-customer";
import { findCustomerByEmail } from "@/lib/ecommerce/customers";
import { recordBoxConsent } from "@/lib/marketing-consent/consent";
import { normaliseResultEmail } from "@/lib/results/owner";
import { resultContactEditable } from "@/lib/results/result-customer";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PhoneSchema = z.string().trim().max(40).optional();

const BodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("link"),
    customerId: z.string().uuid(),
    phone: PhoneSchema,
    marketingEmail: z.boolean(),
  }),
  z.object({
    mode: z.literal("create"),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    name: z.string().trim().max(120).optional(),
    phone: PhoneSchema,
    marketingEmail: z.boolean(),
  }),
]);

type ResultRow = {
  id: string;
  status: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  data: unknown;
};

type CustomerRow = { id: string; email: string; phone: string | null };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx: AdminContext;
  try {
    ctx = await requireAdminContext("customers-edit");
  } catch (denied) {
    if (denied instanceof NextResponse) return denied;
    throw denied;
  }
  if (!hasPermission(ctx, "results")) return json({ error: "Forbidden" }, 403);

  const { id } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const body = parsed.data;

  let phone: string | null = null;
  if (body.phone) {
    phone = normalizePhone(body.phone);
    if (!phone) return json({ error: "That mobile number doesn't look right.", field: "phone" }, 400);
  }

  const admin = supabaseAdmin();
  const { data: rowData, error: rowErr } = await admin
    .from("mp_config_responses")
    .select("id, status, customer_id, customer_email, customer_phone, data")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return json({ error: rowErr.message }, 500);
  if (!rowData) return json({ error: "Not found" }, 404);
  const row = rowData as ResultRow;
  const editable = resultContactEditable(row);
  const resultEmail = normaliseResultEmail(row.customer_email);
  const lockedEmail = () =>
    json(
      {
        error:
          "This Result's email is where its emails and link already go, so it can only belong to the customer with that email.",
        field: "email",
      },
      409,
    );
  if (!editable && body.mode === "create" && body.email && body.email !== resultEmail) return lockedEmail();

  let customer: CustomerRow;
  let created = false;
  if (body.mode === "link") {
    const { data, error } = await admin.from("customers").select("id, email, phone").eq("id", body.customerId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "That customer no longer exists." }, 404);
    customer = data as CustomerRow;
  } else {
    const email = body.email ?? resultEmail;
    if (!email) return json({ error: "An email is needed to create a customer.", field: "email" }, 400);
    try {
      const found = await findCustomerByEmail(email);
      if (found) {
        customer = { id: found.id, email: found.email, phone: found.phone ?? null };
      } else {
        const stored = row.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {};
        const name = body.name ?? (typeof stored.name === "string" ? stored.name : null);
        const newId = await findOrCreateCustomerId(email, newCustomerFields({ name, phone }));
        customer = { id: newId, email, phone };
        created = true;
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Couldn't create the customer." }, 500);
    }
  }

  const customerEmail = normaliseResultEmail(customer.email);
  if (!editable && customerEmail !== resultEmail) return lockedEmail();

  if (phone && !customer.phone) {
    const { error } = await admin.from("customers").update({ phone }).eq("id", customer.id).is("phone", null);
    if (error) return json({ error: error.message }, 500);
  }

  const patch: Record<string, unknown> = { customer_id: customer.id };
  if (editable) {
    patch.customer_email = customerEmail;
    if (!row.customer_phone && (phone ?? customer.phone)) patch.customer_phone = phone ?? customer.phone;
  }
  let update = admin.from("mp_config_responses").update(patch).eq("id", row.id);
  update = row.status == null ? update.is("status", null) : update.eq("status", row.status);
  update = row.customer_email == null ? update.is("customer_email", null) : update.eq("customer_email", row.customer_email);
  const { data: updated, error: updateErr } = await update.select("id");
  if (updateErr) return json({ error: updateErr.message }, 500);
  if (!updated || updated.length === 0) {
    return json({ error: "This Result changed while you were editing it. Reload and try again." }, 409);
  }

  await recordBoxConsent(admin, customer.id, body.marketingEmail, "customisation");

  await recordAdminAction({
    actor: ctx,
    action: "result.customer_link",
    entityType: "result",
    entityId: row.id,
    before: { customer_id: row.customer_id, customer_email: row.customer_email },
    after: { ...patch, created, marketing_box: body.marketingEmail },
  });

  return json({ ok: true, customerId: customer.id, created });
}
