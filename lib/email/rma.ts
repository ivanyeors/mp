import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { getEmailTransport } from ".";
import { renderEmailShell } from "./base";
import { bulletList, card, paragraph, statusPill } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy, type EmailCopySpec } from "./copy";
import { loadEmailCopy } from "./copy-store";
import { getDefaultFromAddress } from "./transport";
import type { RenderedEmail, SendOutcome } from "./types";
import type { RmaResolution } from "@/lib/rma/transitions";

export type RmaEmailTemplateName =
  | "rma_requested"
  | "rma_approved"
  | "rma_rejected"
  | "rma_instructions"
  | "rma_completed"
  | "rma_refunded";

export interface RmaEmailData {
  orderNumber: string;
  customerName: string;
  resolution: RmaResolution;
  status: string;
  items: Array<{ title: string; quantity: number }>;
  message?: string | null;
}

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

const RMA_PLACEHOLDERS = {
  customer_name: "The customer's name, as on the order, e.g. Tan Wei Ling",
  order_number: "The order the return is from, e.g. MP-10428",
  resolution: "What they asked for: a refund, an exchange or a replacement",
};

const BUTTON = { label: "Button", default: "Track your return", hint: "Opens the order, where the return is tracked." };

type StatusCopyKey = "subject" | "heading" | "status" | "intro" | "button";
type StatusTemplateName = Exclude<RmaEmailTemplateName, "rma_requested">;

function statusUpdateCopy(
  key: StatusTemplateName,
  name: string,
  description: string,
  d: { subject: string; heading: string; status: string; intro: string },
) {
  return defineEmailCopy<StatusCopyKey>({
    id: `rma.${key}`,
    name,
    description,
    placeholders: RMA_PLACEHOLDERS,
    fields: {
      subject: {
        label: "Subject",
        default: d.subject,
        hint: "Also the inbox preview line. Name the order, and keep it unlike the other return emails' subjects: one subject for all of them made Gmail fold a customer's returns into one thread.",
      },
      heading: { label: "Heading", default: d.heading },
      status: {
        label: "Status badge",
        default: d.status,
        hint: "A word or two, in a small badge above the message: a sentence here shows as a highlighted strip in Outlook.",
        max: 20,
      },
      intro: { label: "Message", default: d.intro, hint: "Staff's note on the update, when there is one, follows it." },
      button: BUTTON,
    },
  });
}

export const RMA_EMAIL_COPY = {
  rma_requested: defineEmailCopy({
    id: "rma.rma_requested",
    name: "Return requested",
    description: "Sent when a customer asks to return items from an order, listing the items.",
    placeholders: RMA_PLACEHOLDERS,
    fields: {
      subject: { label: "Subject", default: "We've received your return request for order {order_number}" },
      preheader: { label: "Inbox preview line", default: "Your return request for order {order_number} is with us." },
      heading: { label: "Heading", default: "Return request received" },
      intro: {
        label: "Message",
        default: "Hi {customer_name}, we've received your request to return the following item(s) from order {order_number} for {resolution}:",
        hint: "The items follow it.",
      },
      closing: { label: "Under the items", default: "We'll review it and email you the next steps shortly.", optional: true },
      button: BUTTON,
    },
  }),
  rma_approved: statusUpdateCopy("rma_approved", "Return approved", "Sent when Staff approve a return request.", {
    subject: "Your return for order {order_number} was approved",
    heading: "Your return was approved",
    status: "Approved",
    intro: "Hi {customer_name}, your return for order {order_number} was approved.",
  }),
  rma_rejected: statusUpdateCopy("rma_rejected", "Return rejected", "Sent when Staff reject a return request, with their reason when they give one.", {
    subject: "Your return for order {order_number} could not be approved",
    heading: "Your return could not be approved",
    status: "Rejected",
    intro: "Hi {customer_name}, your return for order {order_number} could not be approved.",
  }),
  rma_instructions: statusUpdateCopy("rma_instructions", "Return instructions", "Sent when Staff send the steps for sending the items back, with their instructions.", {
    subject: "Return instructions for order {order_number}",
    heading: "Return instructions",
    status: "Next steps",
    intro: "Hi {customer_name}, here are the next steps for your return on order {order_number}.",
  }),
  rma_completed: statusUpdateCopy("rma_completed", "Return complete", "Sent when a return settled by an exchange or a replacement is complete.", {
    subject: "Your return for order {order_number} is complete",
    heading: "Your return is complete",
    status: "Complete",
    intro: "Hi {customer_name}, your return for order {order_number} is complete.",
  }),
  rma_refunded: statusUpdateCopy("rma_refunded", "Return refunded", "Sent when the refund for a return is issued.", {
    subject: "Your refund for order {order_number} has been issued",
    heading: "Your refund has been issued",
    status: "Refunded",
    intro:
      "Hi {customer_name}, your refund for order {order_number} has been issued. Refunds usually reach your account within 5–10 business days, depending on your bank.",
  }),
} satisfies Record<RmaEmailTemplateName, EmailCopySpec>;

type CopyOf<T extends RmaEmailTemplateName> = EmailCopy<keyof (typeof RMA_EMAIL_COPY)[T]["fields"] & string>;

const rmaValues = (data: RmaEmailData) => ({
  customer_name: data.customerName,
  order_number: data.orderNumber,
  resolution: RESOLUTION_LABEL[data.resolution],
});

function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

function requested(
  data: RmaEmailData,
  copy: CopyOf<"rma_requested"> = defaultEmailCopy(RMA_EMAIL_COPY.rma_requested),
): RenderedEmail {
  const t = filled(copy, rmaValues(data));
  const url = orderUrl(data.orderNumber);
  const text = [
    t.intro,
    "",
    itemsText(data),
    ...(t.closing ? ["", t.closing] : []),
    "",
    `${t.button}: ${url}`,
  ].join("\n");

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${bulletList(itemLabels(data))}
${t.closing ? paragraph(t.closing, { muted: true }) : ""}`,
    cta: { href: url, label: t.button },
  });

  return { subject: t.subject, html, text };
}

function statusUpdate(key: StatusTemplateName, tone: "neutral" | "success" | "danger" = "neutral") {
  return (data: RmaEmailData, copy: EmailCopy<StatusCopyKey> = defaultEmailCopy(RMA_EMAIL_COPY[key])): RenderedEmail => {
    const t = filled(copy, rmaValues(data));
    const url = orderUrl(data.orderNumber);
    const detail = data.message ? `\n\n${data.message}` : "";
    const text = `${t.intro}${detail}

${t.button}: ${url}`;

    const html = renderEmailShell({
      title: t.heading,
      preheader: t.subject,
      bodyHtml: `${statusPill(t.status, tone)}
${paragraph(t.intro, { top: 16 })}
${data.message ? card({ bodyHtml: paragraph(data.message, { bottom: 0 }) }) : ""}`,
      cta: { href: url, label: t.button },
    });
    return { subject: t.subject, html, text };
  };
}

export const RMA_EMAIL_TEMPLATES: {
  [T in RmaEmailTemplateName]: (data: RmaEmailData, copy?: CopyOf<T>) => RenderedEmail;
} = {
  rma_requested: requested,
  rma_approved: statusUpdate("rma_approved", "success"),
  rma_rejected: statusUpdate("rma_rejected", "danger"),
  rma_instructions: statusUpdate("rma_instructions"),
  rma_completed: statusUpdate("rma_completed", "success"),
  rma_refunded: statusUpdate("rma_refunded", "success"),
};

export function renderRmaEmail(
  template: RmaEmailTemplateName,
  data: RmaEmailData,
  copy?: EmailCopy,
): RenderedEmail {
  return (RMA_EMAIL_TEMPLATES[template] as (data: RmaEmailData, copy?: EmailCopy) => RenderedEmail)(data, copy);
}

export async function sendRmaEmail(
  template: RmaEmailTemplateName,
  to: string,
  data: RmaEmailData,
): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const copy = await loadEmailCopy(RMA_EMAIL_COPY[template] as EmailCopySpec);
  const rendered = renderRmaEmail(template, data, copy);
  const result = await transport.send({
    ...rendered,
    to,
    from: getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}

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
