import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { errorTextWithoutStripeRequestId } from "@/lib/stripe/error-text";
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
import { quotedServiceLines, sumServiceLines } from "@/lib/pricing/service-lines";
import { settleResult } from "@/lib/results/settlement";
import {
  companionAtAccept,
  isAnchor,
  isCompanion,
  liveCompanions,
  pairAuthorized,
  pickPartner,
} from "@/lib/results/paired-build";
import { round2 } from "@/lib/commissions";
import { createHeldCommissionsForOrder } from "@/lib/commissions/ledger";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { paymentIntentCapturedAt } from "@/lib/stripe/money-time";
import { applyMilestoneProgress } from "@/lib/milestones/ledger";
import { sendReferralEarnedEmail } from "@/lib/email/partner";
import { findOrCreateCustomer } from "@/lib/ecommerce/customers";
import { incrementCouponUsage } from "@/lib/ecommerce/discounts";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { deductOrderStockOrFlag } from "@/lib/ecommerce/order-stock";
import { getPublicOrigin } from "@/lib/site-url";
import { recordPaidOrderVisit } from "@/lib/analytics/journey/identity";
import { scheduleAutoLabel } from "@/lib/shipping/schedule-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_EMAIL = "unknown@example.com";

function customerEmailOf(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e !== NO_EMAIL && /^[^\s@]+@[^\s@]+$/.test(e) ? e : null;
}

const BodySchema = z.object({
  token: z.string().uuid().optional(),
  topupSessionId: z.string().min(1).optional(),
});

const ACCEPT_COLUMNS = `${ASSIGNED_BUILD_COLUMNS}, status, source, authorized_amount, final_amount, payment_intent_id, topup_payment_intent_id, topup_paid_at, customer_email, customer_id, access_token, order_id, partner_id, ref_code, attribution_source, partner_commission, coupon_id, coupon_code` as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestedId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { token = null, topupSessionId } = parsed.data;
  const admin = supabaseAdmin();
  const origin = getPublicOrigin(req);

  const { data: requested, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(ACCEPT_COLUMNS)
    .eq("id", requestedId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!requested) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(requested, token);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = isCompanion(requested)
    ? (
        await admin
          .from("mp_config_responses")
          .select(ACCEPT_COLUMNS)
          .eq("id", requested.paired_build_id as string)
          .maybeSingle()
      ).data
    : requested;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = row.id as string;

  if (row.status === "captured") {
    return NextResponse.json({ ok: true, status: "captured", orderId: row.order_id });
  }

  if (row.order_id) {
    return NextResponse.json(
      { error: "Result already has an Order", orderId: row.order_id },
      { status: 400 },
    );
  }

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

  const companions = isAnchor(row)
    ? ((
        await admin
          .from("mp_config_responses")
          .select(ACCEPT_COLUMNS)
          .eq("paired_build_id", id)
          .neq("id", id)
      ).data ?? [])
    : [];
  if (liveCompanions(companions, id).length > 1) {
    return NextResponse.json(
      { error: "This order has changed. Please contact us to complete it.", code: "pair_conflict" },
      { status: 409 },
    );
  }
  const companion = pickPartner(companions, id);
  const atAccept = companionAtAccept(companion);
  if (!atAccept.ok) {
    return NextResponse.json({ error: atAccept.error, code: atAccept.code }, { status: 409 });
  }
  const mate = atAccept.include ? companion : null;
  if (mate) {
    if (needsCustomerFinish(mate)) {
      return NextResponse.json(
        { error: "Choose your cover, case and shipping first", code: "needs_finish" },
        { status: 409 },
      );
    }
    const mateLife = transitionResult(
      {
        status: mate.status as "assigned",
        filling_template_id: mate.filling_template_id,
        payment_intent_id: mate.payment_intent_id,
      },
      { action: "accept" },
    );
    if (!mateLife.ok) {
      return NextResponse.json({ error: mateLife.error }, { status: 400 });
    }
  }

  const build = await loadAssignedBuild(admin, row);
  if (!build.ok) {
    return NextResponse.json({ error: build.error }, { status: 400 });
  }
  const mateBuild = mate ? await loadAssignedBuild(admin, mate) : null;
  if (mateBuild && !mateBuild.ok) {
    return NextResponse.json({ error: mateBuild.error }, { status: 400 });
  }
  const shortages = [...build.shortages, ...(mateBuild?.ok ? mateBuild.shortages : [])];
  if (shortages.length > 0) {
    const detail = shortages
      .map((s) => `${s.name}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return NextResponse.json(
      { error: `Insufficient stock to accept: ${detail}`, shortages },
      { status: 409 },
    );
  }

  const authorized = !row.payment_intent_id
    ? null
    : isAnchor(row)
      ? pairAuthorized(companion ? [row, companion] : [row])
      : row.authorized_amount != null
        ? Number(row.authorized_amount)
        : null;
  const anchorFinal =
    row.final_amount != null ? Number(row.final_amount) : build.pricing.total;
  const mateFinal =
    mate && mateBuild?.ok
      ? mate.final_amount != null
        ? Number(mate.final_amount)
        : mateBuild.pricing.total
      : 0;
  const finalAmount = mate ? round2(anchorFinal + mateFinal) : anchorFinal;
  const plan = planCapture(finalAmount, authorized ?? 0);
  const chargedServiceLines = quotedServiceLines(
    row.final_amount != null ? Number(row.final_amount) : null,
    build.pricing,
    build.serviceLines,
  );
  const mateServiceLines =
    mate && mateBuild?.ok
      ? quotedServiceLines(
          mate.final_amount != null ? Number(mate.final_amount) : null,
          mateBuild.pricing,
          mateBuild.serviceLines,
        )
      : [];
  const members = [
    { row, build, finalAmount: anchorFinal, serviceLines: chargedServiceLines },
    ...(mate && mateBuild?.ok
      ? [{ row: mate, build: mateBuild, finalAmount: mateFinal, serviceLines: mateServiceLines }]
      : []),
  ];
  const memberIds = members.map((m) => m.row.id as string);
  const orderSubtotal = members.reduce(
    (t, m) => t + m.build.pricing.goods + sumServiceLines(m.serviceLines),
    0,
  );
  const couponHolder = members.find((m) => m.row.coupon_id || m.row.coupon_code)?.row ?? null;
  const orderDiscount = round2(members.reduce((t, m) => t + m.build.pricing.discount, 0));
  let topUpPaid = 0;
  let topUpPaymentIntentId: string | null = null;

  if (plan.kind === "top_up") {
    if (!topupSessionId && row.topup_payment_intent_id && row.topup_paid_at) {
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

  if (isAnchor(row)) {
    const paidBalance =
      topUpPaid > 0 ||
      (row.topup_payment_intent_id != null && row.topup_paid_at != null);
    const settles =
      plan.kind === "top_up" && Math.round(topUpPaid * 100) === Math.round(plan.topUp * 100);
    if (paidBalance && !settles) {
      return NextResponse.json(
        {
          error: "Your order changed after you paid. Our team will settle it with you.",
          code: "paid_mismatch",
        },
        { status: 409 },
      );
    }
  }

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
  // ponytail: no staleness takeover. A request that dies outright keeps the claim, because a
  // takeover cannot tell "died before the Order insert" from "died after it" and would bring the
  // duplicate Order straight back. That Result stays `accepted` with no order_id and needs a human.
  const releaseClaim = async () => {
    const { error } = await admin
      .from("mp_config_responses")
      .update({ status: "assigned" })
      .in("id", memberIds)
      .eq("status", "accepted")
      .is("order_id", null);
    if (error) console.error("Failed to release accept claim", id, error);
  };

  if (mate) {
    const { data: mateClaimed, error: mateClaimErr } = await admin
      .from("mp_config_responses")
      .update({ status: acceptLife.status })
      .eq("id", mate.id as string)
      .eq("status", "assigned")
      .is("order_id", null)
      .select("id");
    if (mateClaimErr || !mateClaimed?.length) {
      await releaseClaim();
      return NextResponse.json(
        { error: "Your Mbolster changed while accepting. Reload and try again." },
        { status: 409 },
      );
    }
  }

  const holdCaptureAmount = plan.kind === "capture" ? plan.amount : plan.holdCapture;

  if (holdCaptureAmount > 0 && row.payment_intent_id) {
    try {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.retrieve(row.payment_intent_id);
      if (intent.status !== "succeeded") {
        await captureHold(row.payment_intent_id, holdCaptureAmount);
      } else if (
        typeof intent.amount_received === "number" &&
        intent.amount_received !== Math.round(holdCaptureAmount * 100)
      ) {
        return NextResponse.json(
          {
            error: "Payment was already taken for a different total. Our team will settle it with you.",
            code: "capture_mismatch",
          },
          { status: 409 },
        );
      }
    } catch (e) {
      await releaseClaim();
      const message = errorTextWithoutStripeRequestId(e, "Capture failed");
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const captureLife = transitionResult(
    {
      status: "accepted",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
      balance_paid: topUpPaid > 0,
    },
    { action: "capture" },
  );
  if (!captureLife.ok) {
    await releaseClaim();
    return NextResponse.json({ error: captureLife.error }, { status: 500 });
  }

  const settlement = settleResult({
    holdCaptureAmount,
    holdIntentId: row.payment_intent_id,
    topUpPaid,
    topUpIntentId: topUpPaymentIntentId,
  });

  const chargedAt = await Promise.all(
    settlement.charges.map(async (c) => {
      if (!c.stripeObjectId) return null;
      try {
        return await paymentIntentCapturedAt(getStripe(), c.stripeObjectId);
      } catch {
        return null;
      }
    }),
  );
  const nowIso = new Date().toISOString();
  const paidAt = chargedAt.reduce<string>((latest, at) => (at && at > latest ? at : latest), "") || nowIso;

  const productTypeOf = (r: typeof row) => (r.product_type ?? "pillow") as "pillow" | "bolster";

  const shippingAddress = (row.shipping_address ?? {
    recipient: row.customer_email ?? "Customer",
    line1: "—",
    city: "—",
    postal_code: "—",
    country: "SG",
  }) as Record<string, unknown>;

  const now = nowIso;
  const inStoreHandover = row.source === "manual" || row.shipping_address == null;

  let customerId: string | null = (row.customer_id as string | null) ?? null;
  const customerEmail = customerId ? null : customerEmailOf(row.customer_email);
  if (customerEmail) {
    try {
      customerId = (await findOrCreateCustomer(customerEmail)).id;
    } catch (e) {
      console.error("Could not resolve the Customer for an accepted Result", id, e);
    }
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      order_number: "",
      email: row.customer_email ?? NO_EMAIL,
      customer_id: customerId,
      status: inStoreHandover ? "delivered" : "confirmed",
      currency: row.currency ?? "SGD",
      subtotal: orderSubtotal,
      shipping_amount: round2(members.reduce((t, m) => t + m.build.pricing.shipping, 0)),
      tax_amount: round2(members.reduce((t, m) => t + m.build.pricing.tax, 0)),
      discount_amount: orderDiscount,
      coupon_id: couponHolder?.coupon_id ?? null,
      coupon_code: couponHolder?.coupon_code ?? null,
      total: finalAmount,
      shipping_address: shippingAddress,
      payment_method: "stripe",
      payment_reference: settlement.paymentReference,
      paid_at: paidAt,
      delivered_at: inStoreHandover ? now : null,
      amount_captured: settlement.amountCaptured,
      partner_id: row.partner_id,
      ref_code: row.ref_code,
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

  const orderItemIds: string[] = [];
  let itemsErr: string | null = null;
  for (const m of members) {
    const productType = productTypeOf(m.row);
    const { data: fillingTpl } = m.row.filling_template_id
      ? await admin
          .from("bom_templates")
          .select("name")
          .eq("id", m.row.filling_template_id)
          .maybeSingle()
      : { data: null };

    const memberSubtotal = m.build.pricing.goods + sumServiceLines(m.serviceLines);
    const snapshot = buildResultOrderSnapshot({
      resultId: m.row.id as string,
      productType,
      assignedSize: m.row.assigned_size,
      assignedTier: m.row.assigned_tier,
      assignedLength: m.row.assigned_length,
      fillingTemplateId: m.row.filling_template_id,
      fillingTemplateName: fillingTpl?.name ?? null,
      fillingPlacements: m.build.fillingPlacements,
      buildLines: m.build.lines,
      nameByItem: m.build.nameByItem,
      pricing: {
        ...m.build.pricing,
        services: memberSubtotal - m.build.pricing.goods,
        subtotal: memberSubtotal,
      },
      serviceLines: m.serviceLines,
    });

    const { data: orderItem, error: itemErr } = await admin
      .from("order_items")
      .insert({
        order_id: order.id,
        variant_id: null,
        sku:
          productType === "bolster"
            ? `RESULT-BOLSTER-${m.row.assigned_length ?? "X"}`
            : `RESULT-${m.row.assigned_size ?? "X"}-${m.row.assigned_tier ?? "basic"}`,
        product_title:
          productType === "bolster"
            ? `Custom Mbolster ${m.row.assigned_length ?? ""}`.trim()
            : `Custom Mpillow ${m.row.assigned_size ?? ""} ${m.row.assigned_tier ?? "tier"}`.trim(),
        variant_title:
          productType === "pillow"
            ? `${m.row.assigned_size} · ${m.row.assigned_tier} tier`
            : m.row.assigned_length,
        quantity: 1,
        unit_price: m.build.pricing.goods,
        total_price: m.build.pricing.goods,
        unit_cost: m.build.cogs,
        total_cost: m.build.cogs,
        customization_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (itemErr || !orderItem) {
      itemsErr = itemErr?.message ?? "Failed to create order item";
      break;
    }
    orderItemIds.push(orderItem.id as string);

    if (m.serviceLines.length > 0) {
      const { error: serviceErr } = await admin.from("order_items").insert(
        m.serviceLines.map((l) => ({
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
      );
      if (serviceErr) {
        itemsErr = serviceErr.message;
        break;
      }
    }
  }

  if (itemsErr) {
    const { error: rollbackErr } = await admin.from("orders").delete().eq("id", order.id);
    if (!rollbackErr) await releaseClaim();
    return NextResponse.json({ error: itemsErr }, { status: 500 });
  }

  if (couponHolder?.coupon_id) {
    try {
      const counted = await incrementCouponUsage(couponHolder.coupon_id as string);
      if (!counted) {
        await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);
        await addOrderTimelineEvent(
          order.id,
          "coupon_limit_reached",
          "This order used a coupon that had already reached its usage limit.",
          { coupon_id: couponHolder.coupon_id },
        );
      }
    } catch (e) {
      console.error("Coupon usage increment failed after capture", e);
    }
  }

  if (row.source === "online_purchase") {
    await recordPaidOrderVisit(admin, {
      orderId: order.id as string,
      customerId,
      email: (row.customer_email as string | null) ?? null,
    });
  }

  try {
    for (const [i, charge] of settlement.charges.entries()) {
      await recordLedgerEntry(admin, order.id, {
        type: "charge",
        amount: charge.amount,
        currency: row.currency ?? "SGD",
        stripeObjectId: charge.stripeObjectId,
        metadata: { result_id: id },
        occurredAt: chargedAt[i] ?? now,
      });
    }
    await rollupOrderMoney(admin, order.id);
  } catch (e) {
    await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);
    console.error("Ledger write failed after capture", e);
  }

  if (row.partner_id) {
    let qualifies = false;
    try {
      qualifies = await createHeldCommissionsForOrder(admin, {
        orderId: order.id,
        partnerId: row.partner_id,
        deliveredAt: inStoreHandover ? now : null,
        amount: row.partner_commission == null ? null : Number(row.partner_commission),
        items: members.map((m, i) => ({
          id: orderItemIds[i],
          kind: "goods",
          total_price: m.build.pricing.goods,
          customization_snapshot: {
            result_id: m.row.id as string,
            product_type: productTypeOf(m.row),
            assigned_tier: m.row.assigned_tier,
          },
        })),
      });
    } catch (e) {
      console.error("Commission creation failed after capture", e);
    }
    try {
      await applyMilestoneProgress(admin, row.partner_id);
    } catch (e) {
      console.error("Milestone progress failed after capture", e);
    }
    if (qualifies) {
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
  }

  await deductOrderStockOrFlag(admin, order.id, 3);

  await admin.from("order_timeline").insert({
    order_id: order.id,
    event_type: "order_created",
    message: mate
      ? "Order created from an accepted Paired build: Mpillow and Mbolster (authorize-then-capture)."
      : "Order created from accepted Result (authorize-then-capture).",
    metadata: { result_id: id, ...(mate ? { paired_result_id: mate.id } : {}) },
  });

  for (const m of members) {
    const { error: updateErr } = await admin
      .from("mp_config_responses")
      .update({
        status: captureLife.status,
        order_id: order.id,
        final_amount: m.finalAmount,
      })
      .eq("id", m.row.id as string)
      .is("order_id", null);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  if (!inStoreHandover) scheduleAutoLabel(admin, order.id as string);

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
