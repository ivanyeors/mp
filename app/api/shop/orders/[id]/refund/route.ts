import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { intentRefundableBalances, refundPayment } from "@/lib/stripe/refunds";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import {
  STAFF_REFUND_REASONS,
  STAFF_REFUND_REASON_LABELS,
  refundableAmount,
  splitRefundAcrossIntents,
  staffRefundIdempotencyKey,
  stripeRefundReason,
} from "@/lib/ecommerce/admin-refund";
import { staffRefundDeniedReason } from "@/lib/results/post-delivery-refund";
import { voidCommissionsForItems } from "@/lib/commissions/ledger";

export const runtime = "nodejs";

const RefundSchema = z
  .object({
    request_id: z.string().uuid(),
    mode: z.enum(["full", "items", "amount"]),
    amount: z.number().positive().optional(),
    items: z
      .array(
        z.object({
          order_item_id: z.string().uuid(),
          quantity: z.number().int().positive(),
        }),
      )
      .max(100)
      .default([]),
    shipping: z.boolean().default(false),
    reason: z.enum(STAFF_REFUND_REASONS),
    note: z.string().trim().max(500).optional(),
    in_person_return_acknowledged: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.mode !== "full" && body.amount == null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount to refund." });
    }
    if (body.mode === "items" && body.items.length === 0 && !body.shipping) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Choose what to refund." });
    }
    if (new Set(body.items.map((i) => i.order_item_id)).size !== body.items.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Each item once." });
    }
    if (body.reason === "other" && !body.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Say why in the note." });
    }
  });

type OrderLine = {
  id: string;
  product_title: string;
  quantity: number;
  kind: string | null;
  customization_snapshot: unknown;
};

async function paymentIntentsOf(
  admin: SupabaseClient,
  order: { id: string; payment_reference: string },
): Promise<string[]> {
  const { data, error } = await admin
    .from("order_payments")
    .select("stripe_object_id")
    .eq("order_id", order.id)
    .eq("type", "charge");
  if (error) throw new Error(`Couldn't read the order's payments: ${error.message}`);
  const intents = [
    ...new Set(
      (data ?? [])
        .map((r) => r.stripe_object_id as string | null)
        .filter((id): id is string => typeof id === "string" && id.startsWith("pi_")),
    ),
  ];
  return intents.length > 0 ? intents : [order.payment_reference];
}

function money(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;
  const actor = await getAdminContext();

  const { id: orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = RefundSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: first ?? "Invalid refund.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, payment_reference, total, amount_refunded, amount_captured, currency, status, shipped_at, delivered_at, refund_request_status, partner_id, items:order_items(id, product_title, quantity, kind, customization_snapshot)",
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const lines = (order.items ?? []) as OrderLine[];
  const currency = String(order.currency ?? "SGD");
  const returned = input.reason === "returned";

  const resultGate = staffRefundDeniedReason(order, lines, {
    returned,
    inPersonReturnAcknowledged: input.in_person_return_acknowledged === true,
  });
  if (resultGate) {
    return NextResponse.json({ error: resultGate }, { status: 400 });
  }

  if (!order.payment_reference) {
    return NextResponse.json({ error: "Order has no payment to refund" }, { status: 400 });
  }

  if (order.status === "refunded") {
    return NextResponse.json({ error: "Order is already fully refunded" }, { status: 400 });
  }

  const remaining = refundableAmount(order);
  if (remaining <= 0) {
    return NextResponse.json({ error: "Nothing left to refund" }, { status: 400 });
  }

  const byId = new Map(lines.map((l) => [l.id, l]));
  for (const sel of input.items) {
    const line = byId.get(sel.order_item_id);
    if (!line) {
      return NextResponse.json({ error: "That item isn't on this order." }, { status: 400 });
    }
    if (sel.quantity > line.quantity) {
      return NextResponse.json(
        { error: `Only ${line.quantity} × ${line.product_title} were ordered.` },
        { status: 400 },
      );
    }
  }

  const amount = input.mode === "full" ? remaining : Math.round(input.amount! * 100) / 100;
  if (amount < 0.01 || amount > remaining) {
    return NextResponse.json(
      { error: `Refund between 0.01 and ${money(remaining, currency)}.` },
      { status: 400 },
    );
  }

  const amountCents = Math.round(amount * 100);
  const isFullRefund = amountCents >= Math.round(remaining * 100);

  const intents = await paymentIntentsOf(admin, order);
  let parts: Array<{ paymentIntentId: string; cents?: number }>;
  if (intents.length === 1) {
    parts = [{ paymentIntentId: intents[0], ...(isFullRefund ? {} : { cents: amountCents }) }];
  } else {
    const split = splitRefundAcrossIntents(amountCents, await intentRefundableBalances(intents));
    if (!split) {
      return NextResponse.json(
        { error: "Stripe has less left to refund on this order than that. Refresh the page and try again." },
        { status: 409 },
      );
    }
    parts = split;
  }

  const metadata = {
    order_id: orderId,
    order_number: String(order.order_number),
    refund_reason: input.reason,
    refund_request_id: input.request_id,
  };
  const issued: Array<{ refund: Stripe.Refund; cents: number }> = [];
  let failure: string | null = null;
  for (const part of parts) {
    try {
      const refund = await refundPayment({
        paymentIntentId: part.paymentIntentId,
        ...(part.cents != null ? { amount: part.cents / 100 } : {}),
        idempotencyKey: staffRefundIdempotencyKey(orderId, input.request_id, part.paymentIntentId),
        reason: stripeRefundReason(input.reason),
        metadata,
      });
      issued.push({ refund, cents: part.cents ?? amountCents });
    } catch (err) {
      failure = err instanceof Error ? err.message : "Stripe returned an error.";
      break;
    }
  }

  if (issued.length === 0) {
    return NextResponse.json({ error: `Couldn't refund through Stripe: ${failure}` }, { status: 502 });
  }

  const refundedAmount = issued.reduce((t, i) => t + i.cents, 0) / 100;
  const refundIds = issued.map((i) => i.refund.id);
  const refundedLines = input.items.map((sel) => ({
    order_item_id: sel.order_item_id,
    product_title: byId.get(sel.order_item_id)!.product_title,
    quantity: sel.quantity,
  }));

  if (returned && order.refund_request_status === "requested") {
    await admin
      .from("orders")
      .update({
        refund_request_status: "approved",
        refund_return_acknowledged_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  }

  if (returned && order.partner_id && refundedLines.length > 0) {
    try {
      await voidCommissionsForItems(admin, refundedLines.map((l) => l.order_item_id));
    } catch (err) {
      console.error(`[refund] Commission void failed for ${orderId}:`, err);
    }
  }

  const what = [
    ...refundedLines.map((l) => `${l.quantity} × ${l.product_title}`),
    ...(input.shipping ? ["shipping"] : []),
  ];
  const message = [
    `Staff refunded ${money(refundedAmount, currency)}`,
    isFullRefund && issued.length === parts.length ? " (full refund)" : "",
    ` — ${STAFF_REFUND_REASON_LABELS[input.reason]}`,
    what.length > 0 ? `: ${what.join(", ")}` : "",
    input.note ? `. Note: ${input.note}` : "",
  ].join("");

  await addOrderTimelineEvent(orderId, "refund_initiated", message, {
    stripe_refund_ids: refundIds,
    stripe_refund_id: refundIds[0],
    amount: refundedAmount,
    mode: input.mode,
    reason: input.reason,
    note: input.note ?? null,
    lines: refundedLines,
    shipping: input.shipping,
  });

  await recordAdminAction({
    actor,
    action: "order.refund",
    entityType: "order",
    entityId: orderId,
    before: { status: order.status, amount_refunded: Number(order.amount_refunded ?? 0) },
    after: {
      amount: refundedAmount,
      mode: input.mode,
      reason: input.reason,
      note: input.note ?? null,
      lines: refundedLines,
      shipping: input.shipping,
      stripe_refund_ids: refundIds,
    },
  });

  if (failure) {
    return NextResponse.json(
      {
        error: `Refunded ${money(refundedAmount, currency)}, but the rest didn't go through Stripe: ${failure}`,
        amount: refundedAmount,
        stripe_refund_ids: refundIds,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    stripe_refund_id: refundIds[0],
    stripe_refund_ids: refundIds,
    amount: refundedAmount,
    currency,
    pending: issued.some((i) => i.refund.status === "pending"),
  });
}
