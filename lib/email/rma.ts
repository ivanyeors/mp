import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from ".";
import { escapeHtml, renderEmailShell } from "./base";
import { getDefaultFromAddress } from "./transport";
import type { RenderedEmail, SendOutcome } from "./types";
import type { RmaResolution } from "@/lib/rma/transitions";

// ============================================================
// RMA lifecycle emails (ADR 0011)
// ============================================================
//
// Mirrors the order-email module (lib/email/index.ts) but keyed on
// (rma_request_id, template) writing to the `rma_emails` ledger, since one order
// can spawn several RMAs each with its own lifecycle emails. Slice 03 sends
// `rma_requested`; the other templates are stubbed for later slices.

export type RmaEmailTemplateName =
  | "rma_requested"
  | "rma_approved"
  | "rma_rejected"
  | "rma_instructions"
  | "rma_completed"
  | "rma_refunded";

/** Small neutral payload every RMA template renders from. */
export interface RmaEmailData {
  orderNumber: string;
  customerName: string;
  resolution: RmaResolution;
  status: string;
  items: Array<{ title: string; quantity: number }>;
  /** Return instructions / rejection reason etc., set by later slices. */
  message?: string | null;
}

// ------------------------------------------------------------
// Rendering (pure)
// ------------------------------------------------------------

function itemsText(data: RmaEmailData): string {
  return data.items.map((i) => `- ${i.title} x${i.quantity}`).join("\n");
}

function itemsHtml(data: RmaEmailData): string {
  return data.items
    .map((i) => `<li>${escapeHtml(i.title)} &times;${i.quantity}</li>`)
    .join("\n");
}

/** RMA templates carry the heading as copy — delegate to the shared branded base. */
function shell(title: string, bodyHtml: string): string {
  return renderEmailShell({ title, bodyHtml });
}

const RESOLUTION_LABEL: Record<RmaResolution, string> = {
  refund: "a refund",
  exchange: "an exchange",
  replacement: "a replacement",
};

// Each template is a pure (RmaEmailData) -> RenderedEmail. `rma_requested` is the
// only one slice 03 actually sends; the rest are simple stubs later slices flesh
// out. `// ponytail:` stubs share one body — split when a template needs its own
// copy.
function requested(data: RmaEmailData): RenderedEmail {
  const subject = `We've received your return request for order ${data.orderNumber}`;
  const text = `Hi ${data.customerName},

We've received your request to return the following item(s) from order ${data.orderNumber} for ${RESOLUTION_LABEL[data.resolution]}:

${itemsText(data)}

We'll review it and email you the next steps shortly.`;

  const html = shell(
    "Return request received",
    `<p style="color:#444;">Hi ${escapeHtml(data.customerName)}, we've received your request to return
      the following item(s) from order <strong>${escapeHtml(data.orderNumber)}</strong> for
      ${escapeHtml(RESOLUTION_LABEL[data.resolution])}:</p>
    <ul style="color:#444;">${itemsHtml(data)}</ul>
    <p style="color:#444;">We'll review it and email you the next steps shortly.</p>`,
  );

  return { subject, html, text };
}

/** Generic lifecycle-update stub reused by the not-yet-specialised templates. */
function statusUpdate(title: string) {
  return (data: RmaEmailData): RenderedEmail => {
    const subject = `Update on your return for order ${data.orderNumber}`;
    const detail = data.message ? `\n\n${data.message}` : "";
    const text = `Hi ${data.customerName},

${title} for your return on order ${data.orderNumber}.${detail}`;
    const html = shell(
      title,
      `<p style="color:#444;">Hi ${escapeHtml(data.customerName)}, ${escapeHtml(
        title.toLowerCase(),
      )} for your return on order <strong>${escapeHtml(data.orderNumber)}</strong>.</p>${
        data.message ? `<p style="color:#444;">${escapeHtml(data.message)}</p>` : ""
      }`,
    );
    return { subject, html, text };
  };
}

export const RMA_EMAIL_TEMPLATES: Record<
  RmaEmailTemplateName,
  (data: RmaEmailData) => RenderedEmail
> = {
  rma_requested: requested,
  rma_approved: statusUpdate("Your return was approved"),
  rma_rejected: statusUpdate("Your return could not be approved"),
  rma_instructions: statusUpdate("Return instructions"),
  rma_completed: statusUpdate("Your return is complete"),
  rma_refunded: statusUpdate("Your refund has been issued"),
};

export function renderRmaEmail(
  template: RmaEmailTemplateName,
  data: RmaEmailData,
): RenderedEmail {
  return RMA_EMAIL_TEMPLATES[template](data);
}

// ------------------------------------------------------------
// Render + send (no persistence — easy to unit test)
// ------------------------------------------------------------

export async function sendRmaEmail(
  template: RmaEmailTemplateName,
  to: string,
  data: RmaEmailData,
): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const rendered = renderRmaEmail(template, data);
  const result = await transport.send({
    ...rendered,
    to,
    from: getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}

// ------------------------------------------------------------
// Idempotent dispatch (DB-backed, keyed on rma_request_id + template)
// ------------------------------------------------------------

/**
 * Send an RMA lifecycle email at most once per (rma_request_id, template). The
 * `rma_emails` table is the idempotency ledger: a unique row is claimed before
 * sending, so duplicate submits / retries never double-send. Failures are logged
 * and recorded but never thrown — email must never break the request flow.
 */
export async function dispatchRmaEmail(params: {
  rmaRequestId: string;
  template: RmaEmailTemplateName;
  to: string;
  data: RmaEmailData;
  admin?: SupabaseClient;
}): Promise<SendOutcome> {
  const admin = params.admin ?? supabaseAdmin();
  const { rmaRequestId, template, to, data } = params;

  const { data: claim, error: claimError } = await admin
    .from("rma_emails")
    .upsert(
      { rma_request_id: rmaRequestId, template, recipient: to, status: "pending" },
      { onConflict: "rma_request_id,template", ignoreDuplicates: true },
    )
    .select("id");

  if (claimError) {
    console.error(
      `[email] Failed to claim ${template} for rma ${rmaRequestId}:`,
      claimError.message,
    );
    return { sent: false, error: claimError.message };
  }

  if (!claim || claim.length === 0) {
    return { sent: false, skipped: true };
  }

  const claimId = claim[0].id as string;

  try {
    const outcome = await sendRmaEmail(template, to, data);
    await admin
      .from("rma_emails")
      .update({
        status: "sent",
        provider: outcome.transport ?? null,
        provider_message_id: outcome.id ?? null,
      })
      .eq("id", claimId);
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send ${template} for rma ${rmaRequestId}:`, message);
    await admin.from("rma_emails").update({ status: "failed", error: message }).eq("id", claimId);
    return { sent: false, error: message };
  }
}
