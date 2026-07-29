import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { transitionResult } from "@/lib/result-lifecycle";
import {
  captureHold,
  createTopUpCheckout,
  planCapture,
} from "@/lib/authorization-hold";
import { authorizeResultAccess } from "@/lib/results/access";
import { loadAssignedBuild } from "@/lib/results/assigned-build";
import { buildResultOrderSnapshot } from "@/lib/results/order-build-snapshot";
import { createHeldCommissionsForOrder } from "@/lib/commissions/ledger";
import { applyMilestoneProgress } from "@/lib/milestones/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().uuid().optional(),
  /** Checkout session id from a completed top-up payment. */
  topupSessionId: z.string().min(1).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { token = null, topupSessionId } = parsed.data;
  const admin = supabaseAdmin();
  const origin = new URL(req.url).origin;

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, product_type, assigned_size, assigned_tier, assigned_length, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, authorized_amount, final_amount, currency, payment_intent_id, customer_email, customer_id, access_token, order_id, partner_id, ref_code",
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(row, token);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (row.order_id) {
    return NextResponse.json(
      { error: "Result already has an Order", orderId: row.order_id },
      { status: 400 },
    );
  }

  // Idempotent: already captured.
  if (row.status === "captured") {
    return NextResponse.json({ ok: true, status: "captured", orderId: row.order_id });
  }

  const acceptLife = transitionResult(
    {
      status: (row.status as "assigned") ?? "assigned",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
    },
    { action: "accept" },
  );
  if (!acceptLife.ok) {
    return NextResponse.json({ error: acceptLife.error }, { status: 400 });
  }

  const build = await loadAssignedBuild(admin, row);
  if (!build.ok) {
    return NextResponse.json({ error: build.error }, { status: 400 });
  }
  if (build.shortages.length > 0) {
    const detail = build.shortages
      .map((s) => `${s.name}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return NextResponse.json(
      { error: `Insufficient stock to accept: ${detail}`, shortages: build.shortages },
      { status: 409 },
    );
  }

  const authorized =
    row.authorized_amount != null ? Number(row.authorized_amount) : null;
  const finalAmount =
    row.final_amount != null ? Number(row.final_amount) : build.pricing.total;
  if (authorized == null || authorized <= 0) {
    return NextResponse.json({ error: "Result has no authorized hold amount" }, { status: 400 });
  }

  const plan = planCapture(finalAmount, authorized);
  let topUpPaid = 0;

  if (plan.kind === "top_up") {
    if (!topupSessionId) {
      if (!row.customer_email || !row.access_token) {
        return NextResponse.json(
          { error: "Top-up requires customer email and access token" },
          { status: 400 },
        );
      }
      const statusPath = `/results/${id}?token=${row.access_token}`;
      const checkout = await createTopUpCheckout({
        amount: plan.topUp,
        currency: row.currency ?? "SGD",
        customerEmail: row.customer_email,
        resultId: id,
        successUrl: `${origin}${statusPath}&topup_session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${statusPath}`,
        idempotencyKey: `result-topup-${id}-${plan.topUp}`,
      });
      return NextResponse.json({
        needsTopUp: true,
        topUpAmount: plan.topUp,
        authorizedAmount: authorized,
        finalAmount,
        checkoutUrl: checkout.url,
        sessionId: checkout.sessionId,
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(topupSessionId);
    if (session.metadata?.result_id !== id || session.metadata?.purpose !== "result_topup") {
      return NextResponse.json({ error: "Top-up session does not match this Result" }, { status: 400 });
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Top-up payment is not complete" }, { status: 400 });
    }
    const paidMajor = (session.amount_total ?? 0) / 100;
    if (paidMajor + 0.001 < plan.topUp) {
      return NextResponse.json(
        { error: `Top-up amount too low: paid ${paidMajor}, need ${plan.topUp}` },
        { status: 400 },
      );
    }
    topUpPaid = paidMajor;
  }

  const holdCaptureAmount = plan.kind === "capture" ? plan.amount : plan.holdCapture;

  try {
    await captureHold(row.payment_intent_id!, holdCaptureAmount);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Capture failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const captureLife = transitionResult(
    {
      status: "accepted",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
    },
    { action: "capture" },
  );
  if (!captureLife.ok) {
    return NextResponse.json({ error: captureLife.error }, { status: 500 });
  }

  const productType = row.product_type ?? "pillow";
  const title =
    productType === "bolster"
      ? `Custom Mbolster ${row.assigned_length ?? ""}`.trim()
      : `Custom Mpillow ${row.assigned_size ?? ""} ${row.assigned_tier ?? "tier"}`.trim();
  const sku =
    productType === "bolster"
      ? `RESULT-BOLSTER-${row.assigned_length ?? "X"}`
      : `RESULT-${row.assigned_size ?? "X"}-${row.assigned_tier ?? "basic"}`;

  const shippingAddress = (row.shipping_address ?? {
    recipient: row.customer_email ?? "Customer",
    line1: "—",
    city: "—",
    postal_code: "—",
    country: "SG",
  }) as Record<string, unknown>;

  const now = new Date().toISOString();
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      order_number: "",
      email: row.customer_email ?? "unknown@example.com",
      customer_id: row.customer_id,
      status: "confirmed",
      currency: row.currency ?? "SGD",
      subtotal: build.pricing.subtotal,
      shipping_amount: build.pricing.shipping,
      tax_amount: build.pricing.tax,
      discount_amount: 0,
      total: finalAmount,
      shipping_address: shippingAddress,
      payment_method: "stripe",
      payment_reference: row.payment_intent_id,
      paid_at: now,
      // In-store handover == delivered immediately: stamp delivered_at at capture so
      // the RMA return window (and commission release, #77) is dated from delivery,
      // never paid_at. The in-store path has no later "mark delivered" step.
      delivered_at: now,
      amount_captured: holdCaptureAmount + topUpPaid,
      // Referral attribution carried from the Result (#74). One partner per order.
      partner_id: row.partner_id,
      ref_code: row.ref_code,
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message ?? "Failed to create Order" },
      { status: 500 },
    );
  }

  // Null template id = diverged custom mix; the Result snapshot rows carry the fillings.
  const { data: fillingTpl } = row.filling_template_id
    ? await admin
        .from("bom_templates")
        .select("name")
        .eq("id", row.filling_template_id)
        .maybeSingle()
    : { data: null };

  const snapshot = buildResultOrderSnapshot({
    resultId: id,
    productType: productType as "pillow" | "bolster",
    assignedSize: row.assigned_size,
    assignedTier: row.assigned_tier,
    assignedLength: row.assigned_length,
    fillingTemplateId: row.filling_template_id,
    fillingTemplateName: fillingTpl?.name ?? null,
    fillingPlacements: build.fillingPlacements,
    buildLines: build.lines,
    nameByItem: build.nameByItem,
    cogs: build.cogs,
    pricing: build.pricing,
  });

  const { data: orderItem, error: itemErr } = await admin
    .from("order_items")
    .insert({
      order_id: order.id,
      variant_id: null,
      sku,
      product_title: title,
      variant_title:
        productType === "pillow"
          ? `${row.assigned_size} · ${row.assigned_tier} tier`
          : row.assigned_length,
      quantity: 1,
      unit_price: build.pricing.subtotal,
      total_price: build.pricing.subtotal,
      unit_cost: build.cogs,
      total_cost: build.cogs,
      customization_snapshot: snapshot,
    })
    .select("id")
    .single();

  if (itemErr || !orderItem) {
    await admin.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: itemErr?.message ?? "Failed to create order item" }, { status: 500 });
  }

  // Held commission for an attributed in-store order (#77). Base = pillow/bolster
  // BASE price only (build.basePrice = composed MSRP; excludes preference/add-on
  // MSRPs, shipping, tax). Best-effort: money is already captured and the order
  // exists, so a commission-write failure is logged, never fatal.
  if (row.partner_id) {
    try {
      await createHeldCommissionsForOrder(admin, {
        orderId: order.id,
        partnerId: row.partner_id,
        deliveredAt: now,
        lines: [
          {
            orderItemId: orderItem.id,
            productType: productType as "pillow" | "bolster",
            baseAmount: build.basePrice,
            quantity: 1,
          },
        ],
      });
    } catch (e) {
      console.error("Commission creation failed after capture", e);
    }
    // Milestone rung-crossing (#79): detect newly-crossed rungs and apply the
    // one-time bonus + permanent rate bump + ratchet. Best-effort — the money is
    // already captured, so a milestone failure is logged, never fatal.
    try {
      await applyMilestoneProgress(admin, row.partner_id);
    } catch (e) {
      console.error("Milestone progress failed after capture", e);
    }
  }

  // Deduct inventory only after successful capture (US37).
  const transactions = build.lines.map((line) => ({
    item_id: line.item_id,
    quantity_signed: -line.quantity,
    reason: "sale" as const,
    metadata: { order_id: order.id, result_id: id, role: line.role },
  }));
  if (transactions.length > 0) {
    const { error: txErr } = await admin.from("inventory_transactions").insert(transactions);
    if (txErr) {
      await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);
      console.error("Inventory deduction failed after capture", txErr);
    }
  }

  await admin.from("order_timeline").insert({
    order_id: order.id,
    event_type: "order_created",
    message: "Order created from accepted Result (authorize-then-capture).",
    metadata: { result_id: id },
  });

  const { error: updateErr } = await admin
    .from("mp_config_responses")
    .update({
      status: captureLife.status,
      order_id: order.id,
      final_amount: finalAmount,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: captureLife.status,
    orderId: order.id,
    orderNumber: order.order_number,
    capturedHold: holdCaptureAmount,
    topUpPaid,
    finalAmount,
  });
}
