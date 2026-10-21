/**
 * The two aftercare WhatsApp templates (PRD customer-crm slice 13), exactly as
 * they are submitted to Meta by scripts/whatsapp-create-templates.ts and
 * checked by scripts/whatsapp-preflight.ts.
 *
 * The copy is approved by the owner word for word (2026-10-20). Changing any of
 * it needs the owner again, and a new template name: editing an approved
 * template sends it back to Meta's review.
 *
 * Both are submitted as UTILITY. Meta decides the category and may file one as
 * Marketing instead; nothing in the code depends on it. Every body starts and
 * ends with fixed text, and no two variables sit side by side (Meta's rules).
 */

import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import { sgtParts } from "@/lib/appointments/slots";

export type AftercareTemplateDef = {
  /** The template name on Meta, and the default when its env var is unset. */
  name: string;
  /** The env var that switches the template on once Meta approves it. */
  env: "WHATSAPP_TEMPLATE_AFTERCARE_REVIEW" | "WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP";
  category: "UTILITY";
  language: "en";
  /** Body text, `{{1}}` … `{{5}}`. */
  text: string;
  /** One sample value per body variable, in order (Meta needs them to review). */
  example: string[];
  /** The URL button. Its one variable sits at the end of the URL. */
  urlButton: { text: string; url: string; example: string };
};

export const AFTERCARE_REVIEW_TEMPLATE: AftercareTemplateDef = {
  name: "aftercare_review_request",
  env: "WHATSAPP_TEMPLATE_AFTERCARE_REVIEW",
  category: "UTILITY",
  language: "en",
  // {{1}} first name, {{2}} order number, {{3}} product, {{4}} delivery date,
  // {{5}} the staffed sales line (never the sender, lib/contact.ts).
  text:
    "Hi {{1}}, your order {{2}} ({{3}}) was delivered on {{4}}. We'd love to hear how it's going: you can leave us a Google review with the button below.\n\n" +
    "If you need anything else, message our team on WhatsApp at {{5}}.\n\n" +
    "To stop these messages, turn them off in your Mpillow account, or tell our team.",
  example: ["Ivan", "#1042", "Premium Mpillow", "3 Nov 2026", "+65 8780 5311"],
  // The suffix is slice 07's review-request token, so WhatsApp clicks are
  // recorded by our own redirect rather than Google's link.
  urlButton: {
    text: "Write a Google review",
    url: "https://mpillow.com/r/review?t={{1}}",
    example: "https://mpillow.com/r/review?t=Zx81kQ",
  },
};

export const AFTERCARE_CHECKUP_TEMPLATE: AftercareTemplateDef = {
  name: "aftercare_checkup",
  env: "WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP",
  category: "UTILITY",
  language: "en",
  // {{1}} first name, {{2}} product, {{3}} order number, {{4}} the fee read
  // from Costings at send time (slice 08; never written into the template),
  // {{5}} the staffed sales line.
  text:
    "Hi {{1}}, your {{2}} from order {{3}} is due for its yearly re-adjustment, which keeps it fitted to you.\n\n" +
    "A re-adjustment is a paid visit: {{4}}, paid when you book. Use the button below to pick a time, or message our team on WhatsApp at {{5}}.\n\n" +
    "To stop these reminders, turn them off in your Mpillow account, or tell our team.",
  example: ["Ivan", "Premium Mpillow", "#1042", "S$30", "+65 8780 5311"],
  // The suffix is the order item id the re-adjustment is booked against.
  urlButton: {
    text: "Book a re-adjustment",
    url: "https://mpillow.com/appointments?type=readjustment&item={{1}}",
    example: "https://mpillow.com/appointments?type=readjustment&item=6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
  },
};

export const AFTERCARE_WA_TEMPLATES: readonly AftercareTemplateDef[] = [
  AFTERCARE_REVIEW_TEMPLATE,
  AFTERCARE_CHECKUP_TEMPLATE,
];

/** Highest `{{n}}` in a body: how many parameters Meta expects at send. */
export function templateParamCount(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/**
 * One body parameter. Meta refuses an empty one, and one with a newline, a tab
 * or more than four spaces in a row (#132018).
 */
function param(value: string | null | undefined, fallback: string): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

/** A customer with no first name on file is greeted "Hi there". */
export function greetingName(firstName: string | null | undefined): string {
  return param(firstName, "there");
}

/** "3 Nov 2026", the delivery date in Singapore. */
export function aftercareDateSgt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const p = sgtParts(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${p.d} ${months[p.m - 1]} ${p.y}`;
}

const orderRef = (orderNumber: string) => {
  const n = param(orderNumber, "");
  return n.startsWith("#") ? n : `#${n}`;
};

export type AftercareTemplateParams = { bodyParams: string[]; urlButtonParam: string };

/** `aftercare_review_request`'s parameters, in the template's order (slice 07). */
export function reviewRequestTemplateParams(input: {
  firstName: string | null | undefined;
  orderNumber: string;
  /** `purchaseLabel`, e.g. "Premium Mpillow". */
  product: string;
  deliveredAt: string;
  /** The review-request link token, the same one the email carries. */
  token: string;
}): AftercareTemplateParams {
  return {
    bodyParams: [
      greetingName(input.firstName),
      orderRef(input.orderNumber),
      param(input.product, "Mpillow"),
      aftercareDateSgt(input.deliveredAt),
      SUPPORT_WHATSAPP_DISPLAY,
    ],
    urlButtonParam: input.token,
  };
}

/**
 * `aftercare_checkup`'s parameters, in the template's order (slice 08). Throws
 * without a fee: the check-up states the fee, and if Costings cannot give one,
 * nothing is sent (ADR 0028, Consequences).
 */
export function checkupTemplateParams(input: {
  firstName: string | null | undefined;
  product: string;
  orderNumber: string;
  /** The re-adjustment fee from Costings, formatted, e.g. "S$30". */
  fee: string;
  orderItemId: string;
}): AftercareTemplateParams {
  const fee = param(input.fee, "");
  if (!fee) throw new Error("The check-up states its fee: none was given");
  return {
    bodyParams: [
      greetingName(input.firstName),
      param(input.product, "Mpillow"),
      orderRef(input.orderNumber),
      fee,
      SUPPORT_WHATSAPP_DISPLAY,
    ],
    urlButtonParam: input.orderItemId,
  };
}
