import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { getEmailTransport } from ".";
import { renderEmailShell } from "./base";
import { bulletList, card, paragraph, statusPill } from "./components";
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

function itemLabels(data: RmaEmailData): string[] {
  return data.items.map((i) => `${i.title} ×${i.quantity}`);
}

function orderUrl(orderNumber: string): string {
  return `${getSiteOrigin()}/account/orders/${encodeURIComponent(orderNumber)}`;
}

const RESOLUTION_LABEL: Record<RmaResolution, string> = {
  refund: "a refund",
  exchange: "an exchange",
  replacement: "a replacement",
};

// Each template is a pure (RmaEmailData) -> RenderedEmail. `rma_requested` is the
// only one slice 03 actually sends; the rest share one lifecycle-update body that
// later slices can split when a template needs its own copy.
function requested(data: RmaEmailData): RenderedEmail {
  const subject = `We've received your return request for order ${data.orderNumber}`;
  const text = `Hi ${data.customerName},

We've received your request to return the following item(s) from order ${data.orderNumber} for ${RESOLUTION_LABEL[data.resolution]}:

${itemsText(data)}

We'll review it and email you the next steps shortly.

Track your return: ${orderUrl(data.orderNumber)}`;

  const html = renderEmailShell({
    title: "Return request received",
    preheader: `Your return request for order ${data.orderNumber} is with us.`,
    bodyHtml: `${paragraph(
      `Hi ${data.customerName}, we've received your request to return the following item(s) from order ${data.orderNumber} for ${RESOLUTION_LABEL[data.resolution]}:`,
    )}
${bulletList(itemLabels(data))}
${paragraph("We'll review it and email you the next steps shortly.", { muted: true })}`,
    cta: { href: orderUrl(data.orderNumber), label: "Track your return" },
  });

  return { subject, html, text };
}

interface StatusUpdateSpec {
  /** Headline and document <title>. */
  title: string;
  /** Short badge word. */
  status: string;
  tone?: "neutral" | "success" | "danger";
  /** Inbox subject. Must name the order — see the note below. */
  subject: (orderNumber: string) => string;
  /** The one body sentence, used verbatim in BOTH the HTML and the plain text. */
  sentence: (orderNumber: string) => string;
}

/**
 * Lifecycle-update body shared by the five post-request templates.
 *
 * `status` is the short badge word and `title` the sentence — passing the same
 * string to both would print a 33-character sentence inside a pill, which in
 * Outlook (no border-radius) renders as a highlighted strip rather than a badge.
 *
 * `subject` and `sentence` are supplied per template rather than derived from
 * `title`, because deriving them produced two bugs:
 *
 *   * One subject for all five ("Update on your return for order {n}") meant
 *     Gmail collapsed a customer's entire return history into a single thread,
 *     hiding each new update behind a "show trimmed content" fold.
 *   * Lowercasing the title into the sentence gave "your return was approved FOR
 *     YOUR RETURN ON order {n}" — the title already says "your return" — and
 *     read as nonsense for the noun-phrase titles.
 *
 * One `sentence` feeds both renderings, so the HTML and text cannot drift.
 */
function statusUpdate(spec: StatusUpdateSpec) {
  return (data: RmaEmailData): RenderedEmail => {
    const subject = spec.subject(data.orderNumber);
    const sentence = spec.sentence(data.orderNumber);
    const detail = data.message ? `\n\n${data.message}` : "";
    const text = `Hi ${data.customerName},

${sentence}${detail}

Track your return: ${orderUrl(data.orderNumber)}`;

    const html = renderEmailShell({
      title: spec.title,
      preheader: subject,
      bodyHtml: `${statusPill(spec.status, spec.tone ?? "neutral")}
${paragraph(`Hi ${data.customerName}, ${lowerFirst(sentence)}`, { top: 16 })}
${data.message ? card({ bodyHtml: paragraph(data.message, { bottom: 0 }) }) : ""}`,
      cta: { href: orderUrl(data.orderNumber), label: "Track your return" },
    });
    return { subject, html, text };
  };
}

/**
 * Lowercase only the first letter, so a sentence can be reused after "Hi {name},".
 *
 * Deliberately not `toLowerCase()` on the whole string — that would flatten the
 * order number and any product name inside it.
 */
function lowerFirst(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

export const RMA_EMAIL_TEMPLATES: Record<
  RmaEmailTemplateName,
  (data: RmaEmailData) => RenderedEmail
> = {
  rma_requested: requested,
  rma_approved: statusUpdate({
    title: "Your return was approved",
    status: "Approved",
    tone: "success",
    subject: (n) => `Your return for order ${n} was approved`,
    sentence: (n) => `Your return for order ${n} was approved.`,
  }),
  rma_rejected: statusUpdate({
    title: "Your return could not be approved",
    status: "Rejected",
    tone: "danger",
    subject: (n) => `Your return for order ${n} could not be approved`,
    sentence: (n) => `Your return for order ${n} could not be approved.`,
  }),
  rma_instructions: statusUpdate({
    title: "Return instructions",
    status: "Next steps",
    subject: (n) => `Return instructions for order ${n}`,
    sentence: (n) => `Here are the next steps for your return on order ${n}.`,
  }),
  rma_completed: statusUpdate({
    title: "Your return is complete",
    status: "Complete",
    tone: "success",
    subject: (n) => `Your return for order ${n} is complete`,
    sentence: (n) => `Your return for order ${n} is complete.`,
  }),
  rma_refunded: statusUpdate({
    title: "Your refund has been issued",
    status: "Refunded",
    tone: "success",
    subject: (n) => `Your refund for order ${n} has been issued`,
    sentence: (n) => `Your refund for order ${n} has been issued.`,
  }),
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
