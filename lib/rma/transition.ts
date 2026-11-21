import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAdminAction } from "@/lib/auth/audit";
import {
  canTransition,
  type RmaStatus,
  type RmaActor,
  type RmaResolution,
} from "./transitions";
import { emailTemplateForStatus } from "./lifecycle";
import { dispatchRmaEmail, type RmaEmailData } from "@/lib/email/rma";
import { voidCommissionsForRma } from "@/lib/commissions/ledger";

export interface ApplyRmaTransitionOpts {
  rmaId: string;
  to: RmaStatus;
  actorType: RmaActor;
  actor?: { userId: string; email: string } | null;
  reason?: string | null;
  emailMessage?: string | null;
  patch?: Record<string, unknown>;
}

export interface ApplyRmaTransitionResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  from?: RmaStatus;
  to?: RmaStatus;
}

interface TransitionRow {
  id: string;
  status: RmaStatus;
  resolution: RmaResolution;
  orders: { order_number: number | string | null; email: string | null } | null;
  customers: { first_name: string | null; last_name: string | null; email: string | null } | null;
  rma_request_items: Array<{ quantity: number; order_items: { product_title: string | null } | null }>;
}

export async function applyRmaTransition(
  admin: SupabaseClient,
  opts: ApplyRmaTransitionOpts,
): Promise<ApplyRmaTransitionResult> {
  const { data, error } = await admin
    .from("rma_requests")
    .select(
      "id, status, resolution, orders(order_number, email), customers(first_name, last_name, email), rma_request_items(quantity, order_items(product_title))",
    )
    .eq("id", opts.rmaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ok: false, error: "Return not found." };
  const rma = data as unknown as TransitionRow;

  const from = rma.status;
  if (!canTransition(from, opts.to)) {
    return { ok: false, skipped: true, error: `A ${from} return can't be moved to ${opts.to}.` };
  }

  const { error: eventErr } = await admin.from("rma_status_events").insert({
    rma_request_id: opts.rmaId,
    from_status: from,
    to_status: opts.to,
    actor: opts.actorType,
    reason: opts.reason ?? null,
  });
  if (eventErr) throw new Error(eventErr.message);

  const { error: updErr } = await admin
    .from("rma_requests")
    .update({ status: opts.to, updated_at: new Date().toISOString(), ...(opts.patch ?? {}) })
    .eq("id", opts.rmaId);
  if (updErr) throw new Error(updErr.message);

  if (opts.to === "refunded") {
    await voidCommissionsForRma(admin, opts.rmaId);
  }

  await recordAdminAction({
    actor: opts.actor ?? null,
    action: `rma.${opts.to}`,
    entityType: "rma_request",
    entityId: opts.rmaId,
    before: { status: from },
    after: { status: opts.to, reason: opts.reason ?? null },
  });

  const template = emailTemplateForStatus(opts.to);
  const to = rma.orders?.email ?? rma.customers?.email ?? null;
  if (template && to) {
    const name =
      [rma.customers?.first_name, rma.customers?.last_name].filter(Boolean).join(" ").trim() || to;
    const emailData: RmaEmailData = {
      orderNumber: String(rma.orders?.order_number ?? ""),
      customerName: name,
      resolution: rma.resolution,
      status: opts.to,
      items: rma.rma_request_items.map((i) => ({
        title: i.order_items?.product_title ?? "Item",
        quantity: i.quantity,
      })),
      message: opts.emailMessage ?? opts.reason ?? null,
    };
    await dispatchRmaEmail({ rmaRequestId: opts.rmaId, template, to, data: emailData, admin });
  }

  return { ok: true, from, to: opts.to };
}
