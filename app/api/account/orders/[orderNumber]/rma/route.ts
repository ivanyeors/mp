import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/site-settings";
import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";
import {
  planRmaCreate,
  createRmaRequest,
  openReturnedQtyByOrder,
} from "@/lib/rma/create";
import { dispatchRmaEmail } from "@/lib/email/rma";

export const runtime = "nodejs";

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
  resolution: z.enum(["refund", "exchange", "replacement"]),
  reason: z.string().max(1000).optional(),
  customer_note: z.string().max(2000).optional(),
  photo_urls: z.array(z.string().url()).max(10).optional(),
});

/** Slice 03: signed-in customer creates an item-level RMA on a delivered order. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customer = await linkCustomerToAuthUser(user);
  const { orderNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Cross-customer guard: fetch scoped by customer_id (RLS-independent, since we
  // use the service role here) so a customer can never target another's order.
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, status, delivered_at, email, order_items(id, quantity, product_title)",
    )
    .eq("order_number", decodeURIComponent(orderNumber))
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const orderItems = (order.order_items ?? []) as Array<{
    id: string;
    quantity: number;
    product_title: string;
  }>;

  // How much of each line is already tied up in a non-terminal RMA for this order.
  const alreadyReturnedByItem = await openReturnedQtyByOrder(admin, order.id);

  const settings = await getSiteSettings(["rma_return_window_days"]);
  const returnWindowDays =
    Number(settings.rma_return_window_days) || DEFAULT_RETURN_WINDOW_DAYS;

  // Server-side eligibility re-check — never trust the client.
  const plan = planRmaCreate({
    order: { delivered_at: order.delivered_at, status: order.status },
    orderItems,
    alreadyReturnedByItem,
    requestedItems: parsed.data.items,
    resolution: parsed.data.resolution,
    returnWindowDays,
    now: new Date(),
  });
  if (!plan.ok) {
    return NextResponse.json({ error: plan.reason }, { status: 400 });
  }

  let rma;
  try {
    rma = await createRmaRequest(admin, {
      orderId: order.id,
      customerId: customer.id,
      resolution: parsed.data.resolution,
      reason: parsed.data.reason?.trim() || null,
      customerNote: parsed.data.customer_note?.trim() || null,
      photoUrls: parsed.data.photo_urls ?? [],
      items: plan.rows.items,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create request" },
      { status: 500 },
    );
  }

  // Idempotent "request received" email — a retry never double-sends.
  await dispatchRmaEmail({
    rmaRequestId: rma.id,
    template: "rma_requested",
    to: order.email,
    data: {
      orderNumber: decodeURIComponent(orderNumber),
      customerName: customerDisplayName({ ...customer, email: order.email }),
      resolution: parsed.data.resolution,
      status: rma.status,
      items: plan.rows.emailItems,
    },
    admin,
  });

  return NextResponse.json({ ok: true, rma }, { status: 201 });
}

function customerDisplayName(
  customer: { first_name: string | null; last_name: string | null; email: string },
): string {
  const full = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return full || customer.email;
}
