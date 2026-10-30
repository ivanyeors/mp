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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the Order's email reads when the Result has none. Never a Customer. */
const NO_EMAIL = "unknown@example.com";

/** The Result's email when it can name a Customer: an address, and not the fallback. */
function customerEmailOf(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e !== NO_EMAIL && /^[^\s@]+@[^\s@]+$/.test(e) ? e : null;
}

const BodySchema = z.object({
  token: z.string().uuid().optional(),
  /** Checkout session id from a completed top-up payment. */
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

  // A Paired build is accepted as one, on its anchor (ADR 0026). Both share an
  // access token, so the check above already covered the anchor too.
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

  // The companion comes along when it is assigned, is left out once it has
  // ended, and blocks Accept while it is still being built: the shared hold can
  // be captured only once.
  const companions = isAnchor(row)
    ? ((
        await admin
          .from("mp_config_responses")
          .select(ACCEPT_COLUMNS)
          .eq("paired_build_id", id)
          .neq("id", id)
      ).data ?? [])
    : [];
  // One hold, one Mbolster: two in play is a state to stop on, not to guess at.
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

  // One intent authorised the whole pair; each row quotes only its own build.
  // No intent means no card was ever authorised (an abandoned or refused hold
  // Checkout), whatever authorized_amount says: nothing can be captured, so the
  // whole total is a Balance payment. Crediting the quote here created an
  // Order marked paid in full for only the shortfall.
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
  // No Authorization hold is not "unsellable" — it means the whole total is a
  // Balance payment (ADR 0016). planCapture reads 0 as exactly that and returns a
  // top_up plan with nothing to capture from a hold, so both kinds of Result take
  // one settlement path from here down.
  const plan = planCapture(finalAmount, authorized ?? 0);
  // The fees this sale actually charges: a Result priced before Service fees
  // existed keeps its stored total, so its Order must not list a fee line nobody
  // paid for (ADR 0024).
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
  /** Each build that becomes a line on the one Order. */
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
  // The discount code kept at hold (ADR 0033). The Mpillow carries a pair's.
  const couponHolder = members.find((m) => m.row.coupon_id || m.row.coupon_code)?.row ?? null;
  const orderDiscount = round2(members.reduce((t, m) => t + m.build.pricing.discount, 0));
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

  // A Paired build's Balance payment was taken for the pair as it stood then.
  // If the pair has changed since — the Mbolster removed while a Checkout was
  // open — what was paid no longer matches anything Accept could settle, and
  // settling it anyway records money that is not on the Order. Stop for a human:
  // the row stays `assigned` with `topup_paid_at`, which the queue flags.
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
      .in("id", memberIds)
      .eq("status", "accepted")
      .is("order_id", null);
    if (error) console.error("Failed to release accept claim", id, error);
  };

  // The companion is claimed behind its anchor. Only this request holds the
  // anchor, so a miss means Staff moved the companion meanwhile; hand both back.
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
      } else if (
        typeof intent.amount_received === "number" &&
        intent.amount_received !== Math.round(holdCaptureAmount * 100)
      ) {
        // A previous attempt captured a different amount than this one would:
        // the build changed in between. Recording this attempt's amount would
        // ledger less (or more) than Stripe took. Keep the claim — the row reads
        // accept_interrupted for a human — rather than write a wrong Order.
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

  // When Stripe took each payment, by Stripe's clock: the hold's capture just
  // above (or by an earlier attempt), and a Balance payment the customer may
  // have made long before this Accept ran. The sale is made when the last of
  // them landed, so that is the Order's paid_at and each ledger row's time.
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
  // In-store Results carry no shipping address — that is exactly why the placeholder
  // above exists. Those are handed over at the counter, so capture *is* delivery.
  // Everything else still has to be built and shipped, and must not be born
  // "delivered": `delivered_at` anchors the RMA return window (lib/rma/eligibility)
  // and partner commission release (lib/commissions/ledger).
  const inStoreHandover = row.source === "manual" || row.shipping_address == null;

  // Every Order has a Customer when the Result has an email (PRD-loyalty-points
  // slice 03): points are earned by a Customer, and a guest, assisted or
  // in-store Result names none. Resolved from the email as shop checkout does,
  // so the points wait on that email until its owner signs in. Best-effort: the
  // money is captured by now, so a failure leaves the Order without a Customer
  // (and without points) rather than failing the sale.
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
      // A Paired build's Mbolster ships with its Mpillow, so its shipping is 0.
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

  // One goods line per build, each with its own service lines (ADR 0024) and its
  // own snapshot, so a Paired build's Order reads as the two builds it is.
  const orderItemIds: string[] = [];
  let itemsErr: string | null = null;
  for (const m of members) {
    const productType = productTypeOf(m.row);
    // Null template id = diverged custom mix; the Result snapshot rows carry the fillings.
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
      cogs: m.build.cogs,
      pricing: {
        ...m.build.pricing,
        services: memberSubtotal - m.build.pricing.goods,
        subtotal: memberSubtotal,
      },
      // The snapshot is customer-readable: price and name only, never cost.
      serviceLines: m.serviceLines.map((l) => ({ ...l, costPrice: null })),
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
        // Goods only. Service fees are their own lines below (ADR 0024), so the
        // Order's lines still sum to its subtotal and nothing ships a service.
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

    // The Measurement service, when Staff measured (ADR 0024): its own line, never
    // shipped, never stock-deducted, never returnable. Written before the ledger so
    // a failure here still rolls the whole Order back below.
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
    // order_items cascade with the Order, so one delete undoes both inserts.
    const { error: rollbackErr } = await admin.from("orders").delete().eq("id", order.id);
    // An Order we could not delete must not be joined by a second one on retry:
    // keep the claim so the Result shows as accept_interrupted for a human.
    if (!rollbackErr) await releaseClaim();
    return NextResponse.json({ error: itemsErr }, { status: 500 });
  }

  // The code's use is counted now that it is a paid Order, as shop checkout
  // counts one at payment. Until now the live Result held the use (ADR 0033).
  // Once: the Order above is created once per Result, and a retry that finds it
  // returns before here. Best-effort — the money is captured.
  if (couponHolder?.coupon_id) {
    try {
      const counted = await incrementCouponUsage(couponHolder.coupon_id as string);
      if (!counted) {
        // Redeemed after the code was used up: the money is captured, so a
        // human decides whether to recover the discount.
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

  // Record what we actually charged as ledger rows. Without these the order has no
  // `charge` row at all, so summarize() reads captured = 0 and *any* refund
  // satisfies `refunded >= captured` — flipping a partially-refunded Result order
  // to fully refunded, zeroing amount_captured and voiding partner commissions.
  // A topped-up order charges two intents; both must be ledgered or a full refund
  // asks Stripe for more than the hold intent ever captured.
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
    // Money is captured and the Order exists — never fatal. Flag it instead so the
    // row surfaces as stuck rather than silently carrying a broken refund ceiling.
    await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);
    console.error("Ledger write failed after capture", e);
  }

  // The partner's commission for an attributed order (ADR 0034): flat, once per
  // Qualifying Sale, and only when it holds a customised premium pillow. The hold
  // fixed the amount the day the customer paid; a Result without one is priced on
  // today's terms. Best-effort: money is already captured and the order exists, so
  // a commission-write failure is logged, never fatal.
  if (row.partner_id) {
    let qualifies = false;
    try {
      qualifies = await createHeldCommissionsForOrder(admin, {
        orderId: order.id,
        partnerId: row.partner_id,
        // Null for shipped orders: release is dated from real delivery, not capture.
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
    // Milestone progress (#79): counts Qualifying Sales. Best-effort — the money is
    // already captured, so a milestone failure is logged, never fatal.
    try {
      await applyMilestoneProgress(admin, row.partner_id);
    } catch (e) {
      console.error("Milestone progress failed after capture", e);
    }
    // Referral-earned email (#84): fires once per Qualifying Sale (entity_id =
    // order id). delivered_at is stamped at in-store handover, so release is dated.
    // Best-effort — never break capture.
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

  // Deduct inventory only after successful capture (US37): each build's lines, as
  // frozen on its order line above. Retried here; if every attempt fails the
  // Order is flagged and Staff deduct it from the Order page. The money is
  // captured, so this never fails the Accept.
  await deductOrderStockOrFlag(admin, order.id, 3);

  await admin.from("order_timeline").insert({
    order_id: order.id,
    event_type: "order_created",
    message: mate
      ? "Order created from an accepted Paired build: Mpillow and Mbolster (authorize-then-capture)."
      : "Order created from accepted Result (authorize-then-capture).",
    metadata: { result_id: id, ...(mate ? { paired_result_id: mate.id } : {}) },
  });

  // Every member points at the one Order, each keeping its own final amount.
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
