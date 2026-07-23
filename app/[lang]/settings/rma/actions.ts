"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import {
  canTransition,
  type RmaStatus,
  type RmaActor,
  type RmaResolution,
} from "@/lib/rma/transitions";
import { emailTemplateForStatus } from "@/lib/rma/lifecycle";
import { dispatchRmaEmail, type RmaEmailData } from "@/lib/email/rma";
import { getSiteSettings } from "@/lib/site-settings";

/**
 * Save the staff-only internal note on an RMA request (slice 04). This is the
 * audit-logged proving mutation: it writes `rma_requests.admin_note` and records
 * an admin_audit_log row with before/after. It deliberately does NOT append an
 * `rma_status_events` row — status transitions go through {@link transitionRma}.
 */
export async function saveAdminNote(rmaId: string, note: string) {
  const actor = await assertAdmin("orders");
  const admin = supabaseAdmin();

  const { data: before } = await admin
    .from("rma_requests")
    .select("id, admin_note")
    .eq("id", rmaId)
    .maybeSingle();

  const { data, error } = await admin
    .from("rma_requests")
    .update({ admin_note: note })
    .eq("id", rmaId)
    .select("id, admin_note")
    .single();

  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "rma.note",
    entityType: "rma_request",
    entityId: rmaId,
    before,
    after: { admin_note: data.admin_note },
  });

  revalidatePath(`/settings/rma/${rmaId}`);
  return { ok: true };
}

// ------------------------------------------------------------
// Lifecycle transitions (slice 05)
// ------------------------------------------------------------

interface TransitionContext {
  rmaId: string;
  to: RmaStatus;
  /** 'staff' for admin actions. */
  actorType: RmaActor;
  /** Reason recorded on the timeline event + audit (e.g. rejection reason). */
  reason?: string | null;
  /** Extra body for the customer email (e.g. return instructions). */
  emailMessage?: string | null;
}

interface TransitionRmaRow {
  id: string;
  status: RmaStatus;
  resolution: RmaResolution;
  orders: { order_number: number | string | null; email: string | null } | null;
  customers: { first_name: string | null; last_name: string | null; email: string | null } | null;
  rma_request_items: Array<{ quantity: number; order_items: { product_title: string | null } | null }>;
}

/**
 * Move an RMA to `to`, validated against the state machine (ADR 0011). Refuses
 * an illegal transition before any write, then appends the timeline event,
 * caches the new status, audit-logs the action, and fires the matching lifecycle
 * email (idempotent per (rma_request_id, template)). Staff-only.
 */
async function transitionRma(ctx: TransitionContext) {
  const actor = await assertAdmin("orders");
  const admin = supabaseAdmin();

  const { data: rmaData, error: fetchErr } = await admin
    .from("rma_requests")
    .select(
      "id, status, resolution, orders(order_number, email), customers(first_name, last_name, email), rma_request_items(quantity, order_items(product_title))",
    )
    .eq("id", ctx.rmaId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!rmaData) throw new Error("Return not found.");
  const rma = rmaData as unknown as TransitionRmaRow;

  const from = rma.status;
  if (!canTransition(from, ctx.to)) {
    throw new Error(`A ${from} return can't be moved to ${ctx.to}.`);
  }

  // Timeline event is the source of truth; the status column is a cache of it.
  const { error: eventErr } = await admin.from("rma_status_events").insert({
    rma_request_id: ctx.rmaId,
    from_status: from,
    to_status: ctx.to,
    actor: ctx.actorType,
    reason: ctx.reason ?? null,
  });
  if (eventErr) throw new Error(eventErr.message);

  const { error: updErr } = await admin
    .from("rma_requests")
    .update({ status: ctx.to, updated_at: new Date().toISOString() })
    .eq("id", ctx.rmaId);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    actor,
    action: `rma.${ctx.to}`,
    entityType: "rma_request",
    entityId: ctx.rmaId,
    before: { status: from },
    after: { status: ctx.to, reason: ctx.reason ?? null },
  });

  // Idempotent lifecycle email — re-clicking never re-sends.
  const template = emailTemplateForStatus(ctx.to);
  const to = rma.orders?.email ?? rma.customers?.email ?? null;
  if (template && to) {
    const name =
      [rma.customers?.first_name, rma.customers?.last_name].filter(Boolean).join(" ").trim() || to;
    const data: RmaEmailData = {
      orderNumber: String(rma.orders?.order_number ?? ""),
      customerName: name,
      resolution: rma.resolution,
      status: ctx.to,
      items: rma.rma_request_items.map((i) => ({
        title: i.order_items?.product_title ?? "Item",
        quantity: i.quantity,
      })),
      message: ctx.emailMessage ?? ctx.reason ?? null,
    };
    await dispatchRmaEmail({ rmaRequestId: ctx.rmaId, template, to, data, admin });
  }

  revalidatePath(`/settings/rma/${ctx.rmaId}`);
  return { ok: true, from, to: ctx.to };
}

export async function approveRma(rmaId: string) {
  return transitionRma({ rmaId, to: "approved", actorType: "staff" });
}

export async function rejectRma(rmaId: string, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A rejection reason is required.");
  return transitionRma({ rmaId, to: "rejected", actorType: "staff", reason: trimmed });
}

export async function sendInstructions(rmaId: string) {
  const settings = await getSiteSettings(["rma_return_address"]);
  const address = settings.rma_return_address?.trim();
  const message = address
    ? `Please ship the item(s) back to:\n\n${address}\n\nInclude your order number so we can match the return.`
    : "Please reply to this email and our team will share the return address and next steps.";
  return transitionRma({ rmaId, to: "instructions_sent", actorType: "staff", emailMessage: message });
}

// Form adapters (bound with rmaId in the detail page). The trailing FormData arg
// is what React passes to a <form action>; adapters without inputs ignore it.
export async function approveRmaForm(rmaId: string, _formData: FormData) {
  await approveRma(rmaId);
}
export async function rejectRmaForm(rmaId: string, formData: FormData) {
  await rejectRma(rmaId, String(formData.get("reason") ?? ""));
}
export async function sendInstructionsForm(rmaId: string, _formData: FormData) {
  await sendInstructions(rmaId);
}

/** Form adapter: unwraps the textarea value and delegates to {@link saveAdminNote}. */
export async function saveAdminNoteForm(rmaId: string, formData: FormData) {
  await saveAdminNote(rmaId, String(formData.get("note") ?? ""));
}
