import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import { sgtParts } from "@/lib/appointments/slots";

export type AftercareTemplateDef = {
  name: string;
  env: "WHATSAPP_TEMPLATE_AFTERCARE_REVIEW" | "WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP";
  category: "UTILITY";
  language: "en";
  text: string;
  example: string[];
  urlButton: { text: string; url: string; example: string };
};

export const AFTERCARE_REVIEW_TEMPLATE: AftercareTemplateDef = {
  name: "aftercare_review_request",
  env: "WHATSAPP_TEMPLATE_AFTERCARE_REVIEW",
  category: "UTILITY",
  language: "en",
  text:
    "Hi {{1}}, your order {{2}} ({{3}}) was delivered on {{4}}. We'd love to hear how it's going: you can leave us a Google review with the button below.\n\n" +
    "If you need anything else, message our team on WhatsApp at {{5}}.\n\n" +
    "To stop these messages, turn them off in your Mpillow account, or tell our team.",
  example: ["Ivan", "#1042", "Premium Mpillow", "3 Nov 2026", "+65 8780 5311"],
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
  text:
    "Hi {{1}}, your {{2}} from order {{3}} is due for its yearly re-adjustment, which keeps it fitted to you.\n\n" +
    "A re-adjustment is a paid visit: {{4}}, paid when you book. Use the button below to pick a time, or message our team on WhatsApp at {{5}}.\n\n" +
    "To stop these reminders, turn them off in your Mpillow account, or tell our team.",
  example: ["Ivan", "Premium Mpillow", "#1042", "S$30", "+65 8780 5311"],
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

export function templateParamCount(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

function param(value: string | null | undefined, fallback: string): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

export function greetingName(firstName: string | null | undefined): string {
  return param(firstName, "there");
}

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

export function reviewRequestTemplateParams(input: {
  firstName: string | null | undefined;
  orderNumber: string;
  product: string;
  deliveredAt: string;
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

export function checkupTemplateParams(input: {
  firstName: string | null | undefined;
  product: string;
  orderNumber: string;
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
