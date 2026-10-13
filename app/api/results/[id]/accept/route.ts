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
import { ASSIGNED_BUILD_COLUMNS, loadAssignedBuild } from "@/lib/results/assigned-build";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import { buildResultOrderSnapshot } from "@/lib/results/order-build-snapshot";
import { SERVICE_SKUS } from "@/lib/pricing/service-prices";
import { settleResult } from "@/lib/results/settlement";
import { createHeldCommissionsForOrder } from "@/lib/commissions/ledger";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { applyMilestoneProgress } from "@/lib/milestones/ledger";
import { sendReferralEarnedEmail } from "@/lib/email/partner";
import { getPublicOrigin } from "@/lib/site-url";

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
  const origin = getPublicOrigin(req);

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      `${ASSIGNED_BUILD_COLUMNS}, status, source, authorized_amount, final_amount, payment_intent_id, topup_payment_intent_id, topup_paid_at, customer_email, customer_id, access_token, order_id, partner_id, ref_code, attribution_source`,
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(row, token);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Idempotent: already captured. Checked before the order_id guard, which used to
  // shadow it, so a repeat accept gets the Order it already made rather than a 400.
  if (row.status === "captured") {
    return NextResponse.json({ ok: true, status: "captured", orderId: row.order_id });
  }

  if (row.order_id) {
    return NextResponse.json(
      { error: "Result already has an Order", orderId: row.order_id },
      { status: 400 },
    );
  }

  // Not payable until the customer has picked cover, case and shipping (ADR 0017).
  // Beyond the wrong price, a null address below would make the Order be born
  // `delivered`, as if it had been handed over at the counter.
  if (needsCustomerFinish(row)) {
    return NextResponse.json(
      { error: "Choose your cover, case and shipping first", code: "needs_finish" },
      { status: 409 },
    );
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
  // No Authorization hold is not "unsellable" — it means the whole total is a
  // Balance payment (ADR 0016). planCapture reads 0 as exactly that and returns a
  // top_up plan with nothing to capture from a hold, so both kinds of Result take
  // one settlement path from here down.
  const plan = planCapture(finalAmount, authorized ?? 0);
  let topUpPaid = 0;
  /** Second PaymentIntent when the final total outgrew the hold. Ledgered separately. */
  let topUpPaymentIntentId: string | null = null;

  if (plan.kind === "top_up") {
    if (!topupSessionId && row.topup_payment_intent_id && row.topup_paid_at) {
      // The customer paid a top-up and never made it back (tab closed, redirect
      // lost). The webhook persisted the intent, so settle with it rather than
      // charging a second time. Amount comes from Stripe, not a stored column.
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.retrieve(row.topup_payment_intent_id);
      const paidMajor = (intent.amount_received ?? 0) / 100;
      if (intent.status === "succeeded" && paidMajor + 0.001 >= plan.topUp) {
        topUpPaid = paidMajor;
        topUpPaymentIntentId = row.topup_payment_intent_id;
      }
    }

    if (!topupSessionId && !topUpPaymentIntentId) {
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
        holdCapture: plan.holdCapture,
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

    if (topupSessionId) {
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
      topUpPaymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
    }
  }

  // Claim the Result before anything moves money or writes an Order. Every check
  // above read the row and then acted, so a double click or two racing requests
  // both passed and each made an Order, a commission and a stock deduction. Only
  // the request whose conditional update flips `assigned` → `accepted` goes on.
  // `accepted` is the lifecycle's own in-between state, already refused by decline
  // and cancel and skipped by the SLA cron, so no new status or column is needed.
  const { data: claimed, error: claimErr } = await admin
    .from("mp_config_responses")
    .update({ status: acceptLife.status })
    .eq("id", id)
    .eq("status", "assigned")
    .is("order_id", null)
    .select("id");
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
  if (!claimed?.length) {
    const { data: current } = await admin
      .from("mp_config_responses")
      .select("status, order_id")
      .eq("id", id)
      .maybeSingle();
    if (current?.order_id) {
      return NextResponse.json({ ok: true, status: current.status, orderId: current.order_id });
    }
    return NextResponse.json(
      { error: "This Result is already being accepted or has changed. Reload and try again." },
      { status: 409 },
    );
  }
  // Hand the claim back when this attempt fails before an Order exists, so accept
  // can be retried. ponytail: no staleness takeover. A request that dies outright
  // keeps the claim, because a takeover cannot tell "died before the Order insert"
  // from "died after it" and would bring the duplicate Order straight back. That
  // Result stays `accepted` with no order_id and needs a human.
  const releaseClaim = async () => {
    const { error } = await admin
      .from("mp_config_responses")
      .update({ status: "assigned" })
      .eq("id", id)
      .eq("status", "accepted")
      .is("order_id", null);
    if (error) console.error("Failed to release accept claim", id, error);
  };

  const holdCaptureAmount = plan.kind === "capture" ? plan.amount : plan.holdCapture;

  // Capture is not the last write in this route, so a failure after it used to
  // strand the money: a retry re-entered capture on an already-captured intent and
  // 502'd forever. Ask Stripe what actually happened first — a succeeded intent
  // means a previous attempt captured and died downstream, so skip straight to
  // rebuilding the Order. This is what makes the whole route retryable.
  //
  // A Result with no hold has nothing to capture: the Balance payment above
  // already charged the card in full. Skip rather than calling Stripe with a null
  // intent id, which is how this would turn into that same 502 loop.
  if (holdCaptureAmount > 0 && row.payment_intent_id) {
    try {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.retrieve(row.payment_intent_id);
      if (intent.status !== "succeeded") {
        await captureHold(row.payment_intent_id, holdCaptureAmount);
      }
    } catch (e) {
      await releaseClaim();
      const message = e instanceof Error ? e.message : "Capture failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const captureLife = transitionResult(
    {
      status: "accepted",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
      // The lifecycle's sole remaining guard against an Order with no money
      // behind it. For a no-hold Result this is the only thing asserting the
      // customer actually paid.
      balance_paid: topUpPaid > 0,
    },
    { action: "capture" },
  );
  if (!captureLife.ok) {
    await releaseClaim();
    return NextResponse.json({ error: captureLife.error }, { status: 500 });
  }

  // What actually charged. Pure and unit-tested, because a wrong charge row here
  // is silent until someone refunds (lib/results/settlement.ts).
  const settlement = settleResult({
    holdCaptureAmount,
    holdIntentId: row.payment_intent_id,
    topUpPaid,
    topUpIntentId: topUpPaymentIntentId,
  });

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
  // In-store Results carry no shipping address — that is exactly why the placeholder
  // above exists. Those are handed over at the counter, so capture *is* delivery.
  // Everything else still has to be built and shipped, and must not be born
  // "delivered": `delivered_at` anchors the RMA return window (lib/rma/eligibility)
  // and partner commission release (lib/commissions/ledger).
  const inStoreHandover = row.source === "manual" || row.shipping_address == null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      order_number: "",
      email: row.customer_email ?? "unknown@example.com",
      customer_id: row.customer_id,
      status: inStoreHandover ? "delivered" : "confirmed",
      currency: row.currency ?? "SGD",
      subtotal: build.pricing.subtotal,
      shipping_amount: build.pricing.shipping,
      tax_amount: build.pricing.tax,
      discount_amount: 0,
      total: finalAmount,
      shipping_address: shippingAddress,
      payment_method: "stripe",
      payment_reference: settlement.paymentReference,
      paid_at: now,
      // Only the in-store path has no later "mark delivered" step; a shipped order
      // gets its delivered_at from the Orders fulfilment flow.
      delivered_at: inStoreHandover ? now : null,
      amount_captured: settlement.amountCaptured,
      // Referral attribution carried from the Result (#74). One partner per order.
      partner_id: row.partner_id,
      ref_code: row.ref_code,
      // Carry the attribution source too (#80) so the hub can mask link/code rows.
      attribution_source: row.attribution_source,
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    await releaseClaim();
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
    serviceLines: build.serviceLines,
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
      // Goods only. Service fees are their own lines below (ADR 0024), so the
      // Order's lines still sum to its subtotal and nothing ships a service.
      unit_price: build.pricing.goods,
      total_price: build.pricing.goods,
      unit_cost: build.cogs,
      total_cost: build.cogs,
      customization_snapshot: snapshot,
    })
    .select("id")
    .single();

  // The Measurement service, when Staff measured (ADR 0024): its own line, never
  // shipped, never stock-deducted, never returnable. Written before the ledger so
  // a failure here still rolls the whole Order back below.
  const serviceErr =
    !itemErr && orderItem && build.serviceLines.length > 0
      ? (
          await admin.from("order_items").insert(
            build.serviceLines.map((l) => ({
              order_id: order.id,
              variant_id: null,
              kind: "service",
              service_key: l.key,
              sku: SERVICE_SKUS[l.key],
              product_title: l.label,
              variant_title: null,
              quantity: 1,
              unit_price: l.msrp,
              total_price: l.msrp,
              unit_cost: l.costPrice,
              total_cost: l.costPrice,
            })),
          )
        ).error
      : null;

  if (itemErr || !orderItem || serviceErr) {
    // order_items cascade with the Order, so one delete undoes both inserts.
    const { error: rollbackErr } = await admin.from("orders").delete().eq("id", order.id);
    // An Order we could not delete must not be joined by a second one on retry:
    // keep the claim so the Result shows as accept_interrupted for a human.
    if (!rollbackErr) await releaseClaim();
    return NextResponse.json(
      { error: itemErr?.message ?? serviceErr?.message ?? "Failed to create order item" },
      { status: 500 },
    );
  }

  // Record what we actually charged as ledger rows. Without these the order has no
  // `charge` row at all, so summarize() reads captured = 0 and *any* refund
  // satisfies `refunded >= captured` — flipping a partially-refunded Result order
  // to fully refunded, zeroing amount_captured and voiding partner commissions.
  // A topped-up order charges two intents; both must be ledgered or a full refund
  // asks Stripe for more than the hold intent ever captured.
  try {
    for (const charge of settlement.charges) {
      await recordLedgerEntry(admin, order.id, {
        type: "charge",
        amount: charge.amount,
        currency: row.currency ?? "SGD",
        stripeObjectId: charge.stripeObjectId,
        metadata: { result_id: id },
      });
    }
    await rollupOrderMoney(admin, order.id);
  } catch (e) {
    // Money is captured and the Order exists — never fatal. Flag it instead so the
    // row surfaces as stuck rather than silently carrying a broken refund ceiling.
    await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);
    console.error("Ledger write failed after capture", e);
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
        // Null for shipped orders: release is dated from real delivery, not capture.
        deliveredAt: inStoreHandover ? now : null,
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
    // Referral-earned email (#84): fires once per attributed order (entity_id =
    // order id). delivered_at is stamped at in-store handover, so release is dated.
    // Best-effort — never break capture.
    try {
      await sendReferralEarnedEmail(admin, {
        partnerId: row.partner_id,
        orderId: order.id,
        currency: row.currency ?? "SGD",
      });
    } catch (e) {
      console.error("Referral-earned email failed after capture", e);
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
    .eq("id", id)
    .is("order_id", null);

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
