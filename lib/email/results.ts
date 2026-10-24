// ============================================================
// Customisation (Result) lifecycle emails
// ============================================================
//
// These used to live as bare <p> fragments inside the API routes — no <html>
// document, no branding, and user-controlled strings interpolated straight into
// HTML. Rendering now happens here, through the shared shell and the escaping
// components, so route files only send.
//
// Every renderer is pure: (data, copy?) -> RenderedEmail, where `copy` is its
// editable words (RESULT_EMAIL_COPY below) and defaults to their defaults. The
// routes load the saved words first, and keep their own try/catch and their
// "sent" | "failed" return contract.

import { renderEmailShell } from "./base";
import {
  amountPanel,
  bulletList,
  heading,
  infoList,
  link,
  paragraph,
  paragraphHtml,
  statusPill,
} from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy, type EmailCopySpec } from "./copy";
import { money } from "./format";
import { escapeHtml } from "./html";
import { LAYOUT, SPACE } from "./theme";
import { planCapture } from "@/lib/authorization-hold/settlement-plan";
import type { RenderedEmail } from "./types";

/** Human product name from the stored product type. */
function productName(productType: string | null): string {
  return productType === "bolster" ? "Mbolster" : "Mpillow";
}

/**
 * The customer's tokenised status page. Exported so Staff-facing routes can hand
 * the same link out (Request payment) instead of hand-assembling a token URL.
 */
export function statusUrl(
  origin: string,
  resultId: string,
  accessToken: string | null,
): string {
  const base = `${origin}/results/${encodeURIComponent(resultId)}`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

/**
 * Link text for the status page.
 *
 * Never the URL itself: a tokenised status URL is ~95 characters, which wraps to
 * three lines of muted 12px and reads as noise rather than as something to click.
 */
const STATUS_PAGE_LABEL = "status page";

/**
 * The decision card's anchor on the status page. Both Pay and Decline live
 * there, so a cancel link is just a deep link to the same page the CTA opens.
 *
 * Cancelling is deliberately NOT a bare link that acts on click: Gmail, Outlook
 * and corporate security gateways fetch every URL in an email before a human
 * sees it, and a GET that cancelled an order would let them cancel orders
 * nobody clicked. Decline stays a POST behind a confirm dialog.
 */
const DECIDE_ANCHOR = "#decide";
/** The Reorder / Start from scratch block a closed Result shows. */
const REORDER_ANCHOR = "#reorder";

/**
 * Reorder link for a Result that is over.
 *
 * Points at the status page, never at an endpoint that acts. Reordering creates
 * a real, staff-visible order, and mail providers and security gateways fetch
 * every URL in an email before a human sees it — a GET that rebuilt a build
 * would fill the queue with orders nobody asked for. Same rule as the cancel
 * link above.
 */
function reorderUrl(url: string): string {
  return `${url}${REORDER_ANCHOR}`;
}

function cancelUrl(url: string): string {
  return `${url}${DECIDE_ANCHOR}`;
}

/** Link text for the cancel link, and for the configurator link of a cancelled order. */
const CANCEL_LABEL = "cancel this order";
const RESTART_LABEL = "start a new customisation";

type CopyValues = Record<string, string | number | null | undefined>;

/**
 * A sentence of editable copy with a link inside it, as HTML.
 *
 * The link is a placeholder ({status_page_link}, {cancel_link},
 * {restart_link}): Staff move it with the words around it, but never write its
 * markup. Each side of it is filled and escaped like any other copy, and the
 * link itself is the `link()` component's. Everywhere else — the plain-text
 * body, a field that is not drawn through here — the same placeholder fills to
 * the link's words alone.
 */
function withLink(
  raw: string,
  values: CopyValues,
  token: string,
  target: { href: string; label: string },
): string {
  return raw
    .split(`{${token}}`)
    .map((piece) => escapeHtml(fillCopy(piece, values)))
    .join(link(target));
}

/** Muted "changed your mind" line for the emails that ask for money. */
function cancelLineHtml(raw: string, values: CopyValues, url: string): string {
  return paragraphHtml(withLink(raw, values, "cancel_link", { href: cancelUrl(url), label: CANCEL_LABEL }), {
    muted: true,
    top: 4,
  });
}

function cancelLineText(line: string, url: string): string[] {
  return ["", line, cancelUrl(url)];
}

/** Fill every field of `copy` from `values`. */
function filled<K extends string>(copy: EmailCopy<K>, values: CopyValues): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

// ------------------------------------------------------------
// The words of each Result email (PRD-email-templates)
// ------------------------------------------------------------
//
// One spec per renderer. A renderer with several voices (a card hold or none,
// a balance to pay, a finish still to choose) gives each voice its own fields
// under the voice's group; a field with no group shows in every voice. The
// spec rows, amounts and data labels stay in code, and so do the status pills
// and the settlement sentences `renderResultUpdatedEmail` takes from
// `planCapture`: those must agree with what Accept charges, whatever the copy
// says. A field that states a payment fact says so in its hint.

const SUBJECT_HINT = "Also the heading at the top of the email.";
const linkHint = (token: string) => `Keep {${token}} in it: that is the link.`;
const factHint = (fact: string) => `A payment fact: however it is worded, it must still say ${fact}.`;

const HOLD = "With a card hold";
const NO_CARD = "No card (assisted)";
const FINISH = "Cover, case and shipping still to choose";

const PRODUCT_NAME = { product_name: 'The product: "Mpillow", or "Mbolster" for a bolster' };
const STATUS_PAGE_LINK = { status_page_link: 'The words "status page", linked to the customer\'s status page' };
const CANCEL_LINK = { cancel_link: 'The words "cancel this order", linked to where they cancel on their status page' };
const RESTART_LINK = { restart_link: 'The words "start a new customisation", linked to the configurator' };

const ACCEPT_OR_DECLINE = "Accept or decline on the status page. Accept captures payment; Decline releases your hold.";
const ACCEPT_OR_DECLINE_FACT = factHint("that Accept captures payment and Decline releases the hold");
const PAY_TO_CONFIRM_FACT = factHint("that nothing is charged until they pay");
const CANCEL_LINE = {
  label: "Cancel line",
  default: "Changed your mind? You can {cancel_link} on the same page.",
  hint: linkHint("cancel_link"),
};

export const RESULT_EMAIL_COPY = {
  held: defineEmailCopy({
    id: "results.held",
    name: "Customisation under review",
    description:
      "Sent when a customer submits a customisation: under review when they authorised a card hold, or being made when it came in with no card (assisted).",
    placeholders: PRODUCT_NAME,
    fields: {
      intro: { label: "Message", default: "Thanks for submitting your custom {product_name}." },
      subject_hold: { label: "Subject", default: "Your {product_name} is under review", hint: SUBJECT_HINT, group: HOLD },
      preheader_hold: {
        label: "Inbox preview line",
        default: "We've received your custom {product_name}. Nothing has been charged yet.",
        hint: factHint("that nothing has been charged yet"),
        group: HOLD,
      },
      hold_note: {
        label: "Under the authorized amount",
        default: "Not charged yet — we only capture payment once you accept.",
        hint: factHint("that nothing is charged until they accept"),
        group: HOLD,
      },
      closing_hold: {
        label: "Closing line",
        default: "You will be able to accept or decline once an operator finishes review.",
        optional: true,
        group: HOLD,
      },
      button_hold: { label: "Button", default: "Track your review status", group: HOLD },
      subject_no_card: {
        label: "Subject",
        default: "We've received your {product_name} measurements",
        hint: SUBJECT_HINT,
        group: NO_CARD,
      },
      preheader_no_card: {
        label: "Inbox preview line",
        default: "We've received your custom {product_name}. There's nothing to pay yet.",
        hint: factHint("that there is nothing to pay yet"),
        group: NO_CARD,
      },
      closing_no_card: {
        label: "Closing line",
        default: "Our team is making your {product_name} now. We'll email you when it's ready, with the final price.",
        optional: true,
        group: NO_CARD,
      },
      button_no_card: { label: "Button", default: "Track your build", group: NO_CARD },
    },
  }),
  assigned: defineEmailCopy({
    id: "results.assigned",
    name: "Final build ready",
    description:
      "Sent when Staff assign the final build, and when they resend the payment request at an unchanged price: the customer accepts or declines it (card hold), pays for it (assisted), or first chooses cover, case and shipping.",
    placeholders: { ...PRODUCT_NAME, ...CANCEL_LINK },
    fields: {
      intro: { label: "Message", default: "Your final {product_name} build is ready for review." },
      cancel_line: CANCEL_LINE,
      subject_hold: { label: "Subject", default: "Your final build is ready", hint: SUBJECT_HINT, group: HOLD },
      preheader_hold: {
        label: "Inbox preview line",
        default: "Your final {product_name} build is ready for you to accept or decline.",
        group: HOLD,
      },
      closing_hold: { label: "Under the price", default: ACCEPT_OR_DECLINE, hint: ACCEPT_OR_DECLINE_FACT, group: HOLD },
      button_hold: { label: "Button", default: "Review your final build", group: HOLD },
      subject_no_card: {
        label: "Subject",
        default: "Your final build is ready — payment due",
        hint: SUBJECT_HINT,
        group: NO_CARD,
      },
      preheader_no_card: {
        label: "Inbox preview line",
        default: "Your final {product_name} build is priced and ready — review it and pay to confirm.",
        group: NO_CARD,
      },
      closing_no_card: {
        label: "Under the price",
        default: "Review your build on the status page and pay there to confirm your order. Nothing is charged until you do.",
        hint: PAY_TO_CONFIRM_FACT,
        group: NO_CARD,
      },
      button_no_card: { label: "Button", default: "Review and pay", group: NO_CARD },
      subject_finish: {
        label: "Subject",
        default: "Your build is ready — choose your finish",
        hint: SUBJECT_HINT,
        group: FINISH,
      },
      preheader_finish: {
        label: "Inbox preview line",
        default: "Your {product_name} fillings are built — choose your cover, case and shipping.",
        group: FINISH,
      },
      closing_finish: {
        label: "Under the price",
        default:
          "Our team has built your fillings. Choose your cover, case and shipping to see your final price, then pay to confirm your order. Nothing is charged until you do.",
        hint: PAY_TO_CONFIRM_FACT,
        group: FINISH,
      },
      button_finish: { label: "Button", default: "Choose your finish", group: FINISH },
    },
  }),
  updated: defineEmailCopy({
    id: "results.updated",
    name: "Build updated",
    description:
      "Sent when Staff request payment again after changing a build and its price moved: the build as it is now, the new total, and what that means for the customer's card.",
    placeholders: { ...PRODUCT_NAME, ...STATUS_PAGE_LINK, ...CANCEL_LINK },
    fields: {
      subject: { label: "Subject", default: "Your {product_name} build has been updated", hint: SUBJECT_HINT },
      preheader_changed: {
        label: "Inbox preview line, new price",
        default: "Your {product_name} build changed — here is the new spec and what it costs.",
        hint: "When the total moved from what they were last quoted.",
      },
      preheader_unchanged: {
        label: "Inbox preview line, no earlier price",
        default: "Your {product_name} build changed — here is the updated spec.",
        hint: "When there is no earlier total to compare, or it did not move.",
      },
      intro: { label: "Message", default: "We've updated your custom {product_name}. Here is the build as it stands now." },
      status_line: {
        label: "After the closing line",
        default: "You can see the full build any time on its {status_page_link}.",
        hint: linkHint("status_page_link"),
        optional: true,
      },
      cancel_line: CANCEL_LINE,
      closing_hold: { label: "Closing line", default: ACCEPT_OR_DECLINE, hint: ACCEPT_OR_DECLINE_FACT, group: HOLD },
      button_hold: { label: "Button", default: "Review your updated build", group: HOLD },
      closing_no_card: {
        label: "Closing line",
        default:
          "Review the updated build on the status page and pay there to confirm your order. Nothing is charged until you do.",
        hint: PAY_TO_CONFIRM_FACT,
        group: NO_CARD,
      },
      button_no_card: { label: "Button", default: "Review and pay", group: NO_CARD },
    },
  }),
  balance_due: defineEmailCopy({
    id: "results.balance_due",
    name: "Payment reminder",
    description:
      "Sent by the daily job to a customer whose finished build is waiting for them to pay, or to choose its cover, case and shipping.",
    placeholders: { ...PRODUCT_NAME, ...STATUS_PAGE_LINK, ...CANCEL_LINK },
    fields: {
      subject: { label: "Subject", default: "Your {product_name} is built and waiting", hint: SUBJECT_HINT },
      cancel_line: CANCEL_LINE,
      preheader_due: {
        label: "Inbox preview line",
        default: "Your {product_name} is ready — it just needs payment to go into production.",
        group: "Payment due",
      },
      intro_due: {
        label: "Message",
        default: "Your custom {product_name} is finished and waiting for payment.",
        group: "Payment due",
      },
      due_note: {
        label: "Under the total",
        default: "Nothing charged yet — payment confirms your order.",
        hint: factHint("that nothing has been charged yet"),
        group: "Payment due",
      },
      body_due: {
        label: "Pay line",
        default: "Review the full build on its {status_page_link} and pay there to send it into production.",
        hint: linkHint("status_page_link"),
        group: "Payment due",
      },
      button_due: { label: "Button", default: "Review and pay", group: "Payment due" },
      preheader_finish: {
        label: "Inbox preview line",
        default: "Your {product_name} is ready — choose your finish to see the final price.",
        group: FINISH,
      },
      intro_finish: {
        label: "Message",
        default: "Your custom {product_name} fillings are built and waiting for you.",
        group: FINISH,
      },
      body_finish: {
        label: "Choose line",
        default:
          "Choose your cover, case and shipping on its {status_page_link} to see your final price. Nothing is charged until you pay.",
        hint: `${linkHint("status_page_link")} ${PAY_TO_CONFIRM_FACT}`,
        group: FINISH,
      },
      button_finish: { label: "Button", default: "Choose your finish", group: FINISH },
    },
  }),
  declined: defineEmailCopy({
    id: "results.declined",
    name: "Order cancelled by customer",
    description:
      "Sent when a customer declines their build on the status page: confirms the cancellation, and that nothing was charged.",
    placeholders: {
      ...PRODUCT_NAME,
      released_amount: "The card hold released, e.g. SGD 428.00",
      ...RESTART_LINK,
    },
    fields: {
      subject: { label: "Subject", default: "Your {product_name} order is cancelled", hint: SUBJECT_HINT },
      preheader: {
        label: "Inbox preview line",
        default: "Your {product_name} order is cancelled. Nothing was charged.",
        hint: factHint("that nothing was charged"),
      },
      intro: { label: "Message", default: "Your custom {product_name} order has been cancelled, as you asked." },
      money_hold: {
        label: "Money line",
        default:
          "Your card was never charged. The {released_amount} authorization hold has been released — depending on your bank it can take a few days to disappear from your statement.",
        hint: factHint("that the card was never charged and its hold has been released"),
        group: HOLD,
      },
      money_no_card: {
        label: "Money line",
        default: "Nothing was charged, and there is nothing outstanding.",
        hint: factHint("that nothing was charged and nothing is owed"),
        group: NO_CARD,
      },
      reorder_note: {
        label: "Reorder line",
        default:
          "Changed your mind? You do not have to start over — this exact build is still on its status page, and one button rebuilds it at today's prices.",
        group: "Reorder offered",
      },
      restart_line: {
        label: "Start-again line",
        default: "Or {restart_link} from scratch.",
        hint: linkHint("restart_link"),
        optional: true,
        group: "Reorder offered",
      },
      button_reorder: { label: "Button", default: "Reorder this {product_name}", group: "Reorder offered" },
      restart_note: {
        label: "Start-again line",
        default: "Changed your mind? You can start a new customisation whenever you like.",
        hint: "When the customer has no link to their status page, so cannot reorder.",
        group: "No reorder",
      },
      button_restart: { label: "Button", default: "Start a new {product_name}", group: "No reorder" },
    },
  }),
  hold_expired: defineEmailCopy({
    id: "results.hold_expired",
    name: "Hold expired",
    description:
      "Sent by the daily job when a customisation's card hold is released unused: it was not reviewed in time, or the finished build was not paid for in time.",
    placeholders: STATUS_PAGE_LINK,
    fields: {
      preheader: {
        label: "Inbox preview line",
        default: "Your authorization hold has been released — nothing was charged.",
        hint: factHint("that the hold was released and nothing was charged"),
      },
      status_line: {
        label: "Status page line",
        default: "You can still view this customisation on its {status_page_link}.",
        hint: linkHint("status_page_link"),
        optional: true,
      },
      button_restart: {
        label: "Button, start again",
        default: "Start customisation again",
        hint: "When there is no build to reorder: it opens the configurator.",
      },
      subject_unreviewed: {
        label: "Subject",
        default: "Your customisation hold has expired",
        hint: SUBJECT_HINT,
        group: "Not reviewed in time",
      },
      lead_unreviewed: {
        label: "Message",
        default: "Your customisation review window has expired and your card authorization hold has been released.",
        hint: factHint("that the card hold has been released"),
        group: "Not reviewed in time",
      },
      subject_unpaid: {
        label: "Subject",
        default: "Your customisation hold has expired — nothing was charged",
        hint: `${SUBJECT_HINT} ${factHint("that nothing was charged")}`,
        group: "Built but not paid for",
      },
      lead_unpaid: {
        label: "Message",
        default:
          "Your final build was ready, but it was not paid for in time, so your card authorization hold has been released. Nothing was charged.",
        hint: factHint("that the hold has been released and nothing was charged"),
        group: "Built but not paid for",
      },
      closing_reorder: {
        label: "Reorder line",
        default:
          "The build itself is not lost. Reorder it from its status page and we will put the same one back together at today's prices — no need to answer the questions again.",
        optional: true,
        group: "Built but not paid for",
      },
      button_reorder: { label: "Button, reorder", default: "Reorder this build", group: "Built but not paid for" },
      closing_unpaid: {
        label: "Closing line, no reorder",
        default: "Nothing was charged, and there is nothing outstanding.",
        hint: `When the customer has no link to their status page, so cannot reorder. ${factHint("that nothing was charged and nothing is owed")}`,
        optional: true,
        group: "Built but not paid for",
      },
    },
  }),
  paired_mbolster_removed: defineEmailCopy({
    id: "results.paired_mbolster_removed",
    name: "Paired build — Mbolster removed",
    description:
      "Sent when the Mbolster of a Paired build ends on its own while its Mpillow carries on; once the Mpillow is built, it is that Mpillow's ready email too.",
    placeholders: {},
    fields: {
      subject_waiting: {
        label: "Subject",
        default: "Your Mbolster has been removed from your order",
        hint: SUBJECT_HINT,
        group: "Mpillow still being made",
      },
      preheader_waiting: {
        label: "Inbox preview line",
        default: "Your Mbolster was removed; your Mpillow is unaffected.",
        group: "Mpillow still being made",
      },
      lead_waiting: {
        label: "Message",
        default:
          "We could not go ahead with your Mbolster, so it has been removed from your order. Nothing will be charged for it, and your Mpillow is unaffected.",
        hint: factHint("that nothing will be charged for the Mbolster"),
        group: "Mpillow still being made",
      },
      button_waiting: { label: "Button", default: "View your order", group: "Mpillow still being made" },
      subject_ready: {
        label: "Subject",
        default: "Your Mpillow is ready — your Mbolster was removed",
        hint: SUBJECT_HINT,
        group: "Mpillow ready",
      },
      preheader_ready: {
        label: "Inbox preview line",
        default: "Your Mpillow is ready to review and accept.",
        group: "Mpillow ready",
      },
      lead_ready: {
        label: "Message",
        default:
          "Your Mpillow is built and ready for you to review and accept. We could not go ahead with your Mbolster, so it has been removed from the order — nothing will be charged for it.",
        hint: factHint("that nothing will be charged for the Mbolster"),
        group: "Mpillow ready",
      },
      button_ready: { label: "Button", default: "Review your Mpillow", group: "Mpillow ready" },
    },
  }),
  restocked: defineEmailCopy({
    id: "results.restocked",
    name: "Pre-order restocked",
    description: "Sent once by the daily job when the stock a Pre-order customisation was waiting on is back.",
    placeholders: STATUS_PAGE_LINK,
    fields: {
      subject: { label: "Subject", default: "Your customisation has been restocked", hint: SUBJECT_HINT },
      preheader: { label: "Inbox preview line", default: "The inventory for your customisation is back in stock." },
      intro: { label: "Message", default: "Good news — the inventory for your customisation has been restocked." },
      sign_in: { label: "Sign-in line", default: "Sign in in a few days to track your customisation (Result) status." },
      status_line: {
        label: "Status page line",
        default: "You can also view this customisation on its {status_page_link}.",
        hint: linkHint("status_page_link"),
        optional: true,
      },
      button: { label: "Button", default: "Sign in" },
    },
  }),
} satisfies Record<string, EmailCopySpec>;

type CopyOf<T extends keyof typeof RESULT_EMAIL_COPY> = EmailCopy<
  keyof (typeof RESULT_EMAIL_COPY)[T]["fields"] & string
>;

// ------------------------------------------------------------
// Submission received → "under review" (hold) / "being made" (assisted)
// ------------------------------------------------------------

export function renderResultHeldEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string;
  productType: "pillow" | "bolster";
  label: string;
  /**
   * The Authorization hold, or `null` for an Assisted customisation — submitted
   * with no card, so there is no authorized amount and nothing true to say
   * about one. Null is the same discriminator the DB uses (`payment_intent_id
   * IS NULL`); a separate `hasHold` flag could contradict the amount, a null
   * amount cannot. One renderer, so the two voices cannot drift apart.
   */
  amount: number | null;
  currency: string;
}, copy: CopyOf<"held"> = defaultEmailCopy(RESULT_EMAIL_COPY.held)): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const amount = p.amount == null ? null : money(p.amount, p.currency);
  const t = filled(copy, { product_name: name });
  const subject = amount ? t.subject_hold : t.subject_no_card;
  const trackLabel = amount ? t.button_hold : t.button_no_card;
  const closing = amount ? t.closing_hold : t.closing_no_card;

  const text = [
    t.intro,
    "",
    p.label,
    ...(amount ? [`Authorized amount: ${amount}`, t.hold_note] : []),
    "",
    `${trackLabel}:`,
    url,
    ...(closing ? ["", closing] : []),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: amount ? t.preheader_hold : t.preheader_no_card,
    bodyHtml: `${statusPill(amount ? "Under review" : "Being made", "warning")}
${paragraph(t.intro, { top: 16 })}
${infoList([{ label: "Configuration", value: p.label }])}
${
      amount
        ? amountPanel({
            label: "Authorized amount",
            amount,
            caption: t.hold_note,
          })
        : ""
    }
${closing ? paragraph(closing, { muted: true }) : ""}`,
    cta: { href: url, label: trackLabel },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// Operator assigned the final build → "accept or decline" (hold)
//                                   / "review and pay" (Balance payment)
// ------------------------------------------------------------

export interface ResultPricing {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  /**
   * The Authorization hold, or `null` for an Assisted customisation — submitted
   * with no card, so the whole total is owed by Balance payment. Null is the
   * same discriminator the DB uses (`authorized_amount IS NULL`), so it also
   * chooses this email's voice: a separate `hasHold` flag could contradict the
   * amount, a null amount cannot.
   */
  authorized: number | null;
  /**
   * Service fees inside `subtotal` (ADR 0024) — the Measurement service when Staff
   * measured. Listed on their own rows so the customer sees what they pay for.
   */
  services?: Array<{ label: string; amount: number }>;
  /**
   * A discount code on the Result (ADR 0033): off the goods, after the Subtotal.
   * Amount 0 is a free-shipping code — the Shipping row already reads 0.
   */
  discount?: { code: string; amount: number };
}

/** One row per Service fee, before the Subtotal they are part of. */
function serviceRows(pricing: ResultPricing): Array<{ label: string; value: string }> {
  return (pricing.services ?? []).map((s) => ({ label: s.label, value: money(s.amount, pricing.currency) }));
}

/** The discount code's row, after the Subtotal it comes off. */
function discountRows(pricing: ResultPricing): Array<{ label: string; value: string }> {
  if (!pricing.discount) return [];
  return [
    {
      label: `Discount (${pricing.discount.code})`,
      value:
        pricing.discount.amount > 0
          ? `−${money(pricing.discount.amount, pricing.currency)}`
          : "Free shipping",
    },
  ];
}

/** What the build IS — size and tier, or a bolster's length. */
function buildSpecRows(p: {
  productType: string;
  size: string | null;
  tier: string | null;
  length: string | null;
}): Array<{ label: string; value: string }> {
  return p.productType === "bolster"
    ? [{ label: "Length", value: p.length ?? "—" }]
    : [
        { label: "Size", value: p.size ?? "—" },
        { label: "Tier", value: p.tier ?? "—" },
      ];
}

/**
 * Fillings, preferences and add-ons as bullet sections.
 *
 * These come from admin-editable item names, so they MUST go through an
 * escaping component — they were interpolated raw before this module existed.
 *
 * Asymmetric spacing binds each label to the list it introduces. With
 * heading()'s flat `0 0 16px` the three labels sat equidistant between the
 * lists and read as belonging to neither.
 */
function buildSectionsHtml(p: {
  fillingSummary: string[];
  preferences: string[];
  addons: string[];
}): string {
  const section = (label: string, items: string[]): string =>
    items.length > 0
      ? `${heading(label, 3, { top: LAYOUT.gutter, bottom: SPACE.sm })}${bulletList(items)}`
      : "";
  return [
    section("Fillings", p.fillingSummary),
    section("Preferences", p.preferences),
    section("Add-ons", p.addons),
  ].join("\n");
}

export function renderResultAssignedEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string;
  productType: string;
  size: string | null;
  tier: string | null;
  length: string | null;
  fillingSummary: string[];
  preferences: string[];
  addons: string[];
  pricing: ResultPricing | null;
  /**
   * Assisted customisation sent from the questionnaire (ADR 0017): Staff have
   * composed the fillings, but the customer has not chosen cover, case or
   * shipping yet. The price is a floor, not a total, so the email shows
   * "from" and asks the customer to choose rather than to pay.
   */
  needsFinish?: boolean;
  /**
   * The other half of a Paired build (ADR 0026), accepted and paid together with
   * this one: named, priced, and added into a total for both.
   */
  paired?: { label: string; total: number } | null;
}, copy: CopyOf<"assigned"> = defaultEmailCopy(RESULT_EMAIL_COPY.assigned)): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  // One renderer, three voices — the spec rows are shared so they cannot drift;
  // only the ask and how much of the price is known differ.
  const hasHold = p.pricing?.authorized != null;
  const finish = Boolean(p.needsFinish) && !hasHold;
  const values = { product_name: name, cancel_link: CANCEL_LABEL };
  const t = filled(copy, values);
  const voice = <T>(hold: T, finishing: T, noCard: T): T => (hasHold ? hold : finish ? finishing : noCard);
  const subject = voice(t.subject_hold, t.subject_finish, t.subject_no_card);
  const ctaLabel = voice(t.button_hold, t.button_finish, t.button_no_card);
  const closing = voice(t.closing_hold, t.closing_finish, t.closing_no_card);
  const sizeLine =
    p.productType === "bolster"
      ? `Length: ${p.length ?? "—"}`
      : `Size: ${p.size ?? "—"} · Tier: ${p.tier ?? "—"}`;

  const priceLines = finish
    ? p.pricing
      ? [`From: ${money(p.pricing.subtotal, p.pricing.currency)} (before shipping)`]
      : []
    : p.pricing
    ? [
        ...serviceRows(p.pricing).map((r) => `${r.label}: ${r.value}`),
        `Subtotal: ${money(p.pricing.subtotal, p.pricing.currency)}`,
        ...discountRows(p.pricing).map((r) => `${r.label}: ${r.value}`),
        `Shipping: ${money(p.pricing.shipping, p.pricing.currency)}`,
        `Tax: ${money(p.pricing.tax, p.pricing.currency)}`,
        `Total: ${money(p.pricing.total, p.pricing.currency)}`,
        p.paired ? `Also in this order: ${p.paired.label} — ${money(p.paired.total, p.pricing.currency)}` : null,
        p.paired ? `Total for both: ${money(p.pricing.total + p.paired.total, p.pricing.currency)}` : null,
        p.pricing.authorized != null
          ? `Authorized hold: ${money(p.pricing.authorized, p.pricing.currency)}`
          : null,
      ].filter((line): line is string => Boolean(line))
    : [];

  const text = [
    t.intro,
    "",
    sizeLine,
    `Fillings: ${p.fillingSummary.join(", ") || "—"}`,
    ...(finish
      ? []
      : [
          `Preferences: ${p.preferences.join(", ") || "—"}`,
          `Add-ons: ${p.addons.join(", ") || "—"}`,
        ]),
    ...priceLines,
    "",
    closing,
    "",
    `${ctaLabel}:`,
    url,
    ...cancelLineText(t.cancel_line, url),
  ].join("\n");

  const specRows = buildSpecRows(p);

  const pricingRows = finish
    ? p.pricing
      ? [{ label: "From (before shipping)", value: money(p.pricing.subtotal, p.pricing.currency), strong: true }]
      : []
    : p.pricing
    ? [
        ...serviceRows(p.pricing),
        { label: "Subtotal", value: money(p.pricing.subtotal, p.pricing.currency) },
        ...discountRows(p.pricing),
        { label: "Shipping", value: money(p.pricing.shipping, p.pricing.currency) },
        { label: "Tax", value: money(p.pricing.tax, p.pricing.currency) },
        { label: "Total", value: money(p.pricing.total, p.pricing.currency), strong: true },
        ...(p.paired
          ? [
              { label: `Also in this order: ${p.paired.label}`, value: money(p.paired.total, p.pricing.currency) },
              {
                label: "Total for both",
                value: money(p.pricing.total + p.paired.total, p.pricing.currency),
                strong: true,
              },
            ]
          : []),
        ...(p.pricing.authorized != null
          ? [
              {
                label: "Authorized hold",
                value: money(p.pricing.authorized, p.pricing.currency),
              },
            ]
          : []),
      ]
    : [];

  const html = renderEmailShell({
    title: subject,
    preheader: voice(t.preheader_hold, t.preheader_finish, t.preheader_no_card),
    bodyHtml: `${paragraph(t.intro)}
${infoList(specRows)}
${buildSectionsHtml(p)}
${pricingRows.length > 0 ? infoList(pricingRows) : ""}
${paragraph(closing, { muted: true })}
${cancelLineHtml(copy.cancel_line, values, url)}`,
    cta: { href: url, label: ctaLabel },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// Staff re-configured an assigned build → "your build has been updated"
// ------------------------------------------------------------

/**
 * Staff changed a build the customer has already been told about, and the price
 * moved with it (`/api/results/[id]/reconfigure`, then Request payment).
 *
 * Its own template rather than a second copy of the assigned email, for the
 * same reason `renderBalanceDueReminderEmail` is: that one announces a build as
 * news. Re-sending it under "Your final build is ready" with a different total
 * gives the customer two emails with the same subject, different numbers and
 * nothing saying which is current — and if the new total outgrew their
 * Authorization hold, the one thing they most need to know is the thing it
 * never mentions.
 *
 * So this says what changed, what it costs now, and what that means for their
 * card. The money sentence comes from `planCapture` — the function Accept
 * actually settles with — so the email cannot promise a split the checkout
 * then contradicts.
 */
export function renderResultUpdatedEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string | null;
  productType: string;
  size: string | null;
  tier: string | null;
  length: string | null;
  fillingSummary: string[];
  preferences: string[];
  addons: string[];
  pricing: ResultPricing;
  /** What they were last quoted. Null when the Result carried no stored total. */
  previousTotal: number | null;
}, copy: CopyOf<"updated"> = defaultEmailCopy(RESULT_EMAIL_COPY.updated)): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const { currency, total } = p.pricing;
  const authorized = p.pricing.authorized;
  const hasHold = authorized != null;
  const values = { product_name: name, status_page_link: STATUS_PAGE_LABEL, cancel_link: CANCEL_LABEL };
  const t = filled(copy, values);
  const subject = t.subject;
  const priceChanged = p.previousTotal != null && Math.abs(p.previousTotal - total) >= 0.005;

  // One authority for the settlement split: `planCapture` is what Accept runs.
  // It refuses a non-positive total, which is not a case this email can
  // describe either, so fall back to the plain "here is the total" voice.
  const plan =
    total > 0
      ? planCapture(total, authorized ?? 0)
      : ({ kind: "top_up", holdCapture: 0, topUp: total } as const);

  const moneyPanel =
    plan.kind === "capture"
      ? {
          label: "New total",
          amount: money(total, currency),
          caption: `Your card is authorized for ${money(
            authorized!,
            currency,
          )} — we only capture this amount, and only when you accept.`,
        }
      : plan.holdCapture > 0
        ? {
            label: "Balance to pay",
            amount: money(plan.topUp, currency),
            caption: `Your card is authorized for ${money(
              plan.holdCapture,
              currency,
            )} of the ${money(total, currency)} total. The balance is paid at checkout when you accept.`,
          }
        : {
            label: "New total",
            amount: money(total, currency),
            caption: "Nothing has been charged yet — payment confirms your order.",
          };

  const pricingRows = [
    ...serviceRows(p.pricing),
    { label: "Subtotal", value: money(p.pricing.subtotal, currency) },
    ...discountRows(p.pricing),
    { label: "Shipping", value: money(p.pricing.shipping, currency) },
    { label: "Tax", value: money(p.pricing.tax, currency) },
    ...(priceChanged
      ? [{ label: "Previously quoted", value: money(p.previousTotal!, currency) }]
      : []),
    { label: "New total", value: money(total, currency), strong: true },
    ...(hasHold
      ? [{ label: "Authorized hold", value: money(authorized, currency) }]
      : []),
  ];

  const closing = hasHold ? t.closing_hold : t.closing_no_card;
  const ctaLabel = hasHold ? t.button_hold : t.button_no_card;
  const statusLink = { href: url, label: STATUS_PAGE_LABEL };

  const text = [
    t.intro,
    "",
    p.productType === "bolster"
      ? `Length: ${p.length ?? "—"}`
      : `Size: ${p.size ?? "—"} · Tier: ${p.tier ?? "—"}`,
    `Fillings: ${p.fillingSummary.join(", ") || "—"}`,
    `Preferences: ${p.preferences.join(", ") || "—"}`,
    `Add-ons: ${p.addons.join(", ") || "—"}`,
    "",
    ...serviceRows(p.pricing).map((r) => `${r.label}: ${r.value}`),
    `Subtotal: ${money(p.pricing.subtotal, currency)}`,
    ...discountRows(p.pricing).map((r) => `${r.label}: ${r.value}`),
    `Shipping: ${money(p.pricing.shipping, currency)}`,
    `Tax: ${money(p.pricing.tax, currency)}`,
    ...(priceChanged ? [`Previously quoted: ${money(p.previousTotal!, currency)}`] : []),
    `New total: ${money(total, currency)}`,
    ...(hasHold ? [`Authorized hold: ${money(authorized, currency)}`] : []),
    ...(plan.kind === "top_up" && plan.holdCapture > 0
      ? [`Balance to pay at checkout: ${money(plan.topUp, currency)}`]
      : []),
    "",
    // The same reassurance the HTML carries in its amount panel. Without it a
    // plain-text reader sees a total under an authorized hold and has to guess
    // which of the two numbers is coming off their card.
    moneyPanel.caption,
    "",
    [closing, t.status_line].filter(Boolean).join(" "),
    "",
    `${ctaLabel}:`,
    url,
    ...cancelLineText(t.cancel_line, url),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: priceChanged ? t.preheader_changed : t.preheader_unchanged,
    bodyHtml: `${statusPill("Updated", "warning")}
${paragraph(t.intro, { top: 16 })}
${infoList(buildSpecRows(p))}
${buildSectionsHtml(p)}
${infoList(pricingRows)}
${amountPanel(moneyPanel)}
${paragraphHtml(
      [
        withLink(hasHold ? copy.closing_hold : copy.closing_no_card, values, "status_page_link", statusLink),
        copy.status_line ? withLink(copy.status_line, values, "status_page_link", statusLink) : "",
      ]
        .filter(Boolean)
        .join(" "),
      { muted: true },
    )}
${cancelLineHtml(copy.cancel_line, values, url)}`,
    cta: { href: url, label: ctaLabel },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// Build ready, nobody paid → "your build is waiting"
// ------------------------------------------------------------

/**
 * Reminder for an assigned Result awaiting a Balance payment (ADR 0016).
 *
 * Its own template rather than a re-send of the assigned email: that one is the
 * full build spec and reads as news, and a customer who already has it does not
 * need it twice. This is a nudge — what is owed, and the way back.
 */
export function renderBalanceDueReminderEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string | null;
  productType: string | null;
  amount: number | null;
  currency: string;
  /** Cover, case and shipping still to choose (ADR 0017): nudge to finish, not to pay. */
  needsFinish?: boolean;
}, copy: CopyOf<"balance_due"> = defaultEmailCopy(RESULT_EMAIL_COPY.balance_due)): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const values = { product_name: name, status_page_link: STATUS_PAGE_LABEL, cancel_link: CANCEL_LABEL };
  const t = filled(copy, values);
  const subject = t.subject;
  const statusLink = { href: url, label: STATUS_PAGE_LABEL };

  if (p.needsFinish) {
    const text = [
      t.intro_finish,
      "",
      t.body_finish,
      "",
      `${t.button_finish}:`,
      url,
      ...cancelLineText(t.cancel_line, url),
    ].join("\n");
    const html = renderEmailShell({
      title: subject,
      preheader: t.preheader_finish,
      bodyHtml: `${statusPill("Choose your finish", "warning")}
${paragraph(t.intro_finish, { top: 16 })}
${paragraphHtml(withLink(copy.body_finish, values, "status_page_link", statusLink), { muted: true })}
${cancelLineHtml(copy.cancel_line, values, url)}`,
      cta: { href: url, label: t.button_finish },
    });
    return { subject, text, html };
  }

  const total = p.amount == null ? null : money(p.amount, p.currency);

  const text = [
    t.intro_due,
    "",
    ...(total ? [`Total: ${total}`, t.due_note, ""] : []),
    t.body_due,
    "",
    `${t.button_due}:`,
    url,
    ...cancelLineText(t.cancel_line, url),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: t.preheader_due,
    bodyHtml: `${statusPill("Payment due", "warning")}
${paragraph(t.intro_due, { top: 16 })}
${
      total
        ? amountPanel({
            label: "Total",
            amount: total,
            caption: t.due_note,
          })
        : ""
    }
${paragraphHtml(withLink(copy.body_due, values, "status_page_link", statusLink), { muted: true })}
${cancelLineHtml(copy.cancel_line, values, url)}`,
    cta: { href: url, label: t.button_due },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// Customer declined → "your order is cancelled"
// ------------------------------------------------------------

/**
 * Confirmation that a customer's own Decline went through.
 *
 * Until now Decline was silent: the status flipped, any hold was released, and
 * nobody told the customer anything. A cancellation the customer cannot see
 * confirmed is the one most likely to become a support message, so this closes
 * the loop and says plainly that no money was taken.
 *
 * Separate from `renderHoldExpiredEmail`, which reports a cancellation WE made
 * when the SLA ran out. Same outcome, opposite author — telling someone their
 * order "expired" when they cancelled it reads as a system that was not
 * listening.
 */
export function renderResultDeclinedEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string | null;
  productType: string | null;
  /** The released Authorization hold, or null when no card was ever taken. */
  releasedAmount: number | null;
  currency: string;
}, copy: CopyOf<"declined"> = defaultEmailCopy(RESULT_EMAIL_COPY.declined)): RenderedEmail {
  const name = productName(p.productType);
  // Derived, not passed: same as renderHoldExpiredEmail. A caller-supplied path
  // would be an unescaped fragment of an href for no benefit — product_type is
  // already the only thing that decides it.
  const restartPath = p.productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const restartHref = `${p.origin}${restartPath}`;
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  // statusUrl without a token still resolves to the Result page, but a customer
  // arriving there unauthenticated cannot act on it — so the reorder CTA only
  // leads the email when the token is there to make it work.
  const canReorder = p.accessToken != null;
  const released = p.releasedAmount == null ? null : money(p.releasedAmount, p.currency);
  const values = { product_name: name, released_amount: released, restart_link: RESTART_LABEL };
  const t = filled(copy, values);
  const subject = t.subject;

  const moneyLine = released ? t.money_hold : t.money_no_card;

  const text = [
    t.intro,
    "",
    moneyLine,
    "",
    ...(canReorder
      ? [
          t.reorder_note,
          "",
          `${t.button_reorder}:`,
          reorderUrl(url),
          ...(t.restart_line ? ["", t.restart_line, restartHref] : []),
        ]
      : [t.restart_note, "", `${t.button_restart}:`, restartHref]),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: t.preheader,
    bodyHtml: `${statusPill("Cancelled", "neutral")}
${paragraph(t.intro, { top: 16 })}
${paragraph(moneyLine, { muted: true })}
${
      canReorder
        ? `${paragraph(t.reorder_note, { muted: true })}
${
            copy.restart_line
              ? paragraphHtml(withLink(copy.restart_line, values, "restart_link", { href: restartHref, label: RESTART_LABEL }), {
                  muted: true,
                  top: 4,
                })
              : ""
          }`
        : paragraph(t.restart_note, { muted: true })
    }`,
    cta: canReorder
      ? { href: reorderUrl(url), label: t.button_reorder }
      : { href: restartHref, label: t.button_restart },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// SLA passed → hold released
// ------------------------------------------------------------

export function renderHoldExpiredEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string | null;
  productType: string | null;
  /**
   * Which expiry this is.
   *
   * `unreviewed` — the default and the original behaviour: the Result was still
   * waiting on an operator when the SLA ran out. That is our delay, not theirs.
   *
   * `unpaid` — the build was finished and priced, and the Authorization hold
   * died before the customer accepted it. Telling that customer their "review
   * window expired" is the wrong story: there was nothing left for them to
   * review, only something to pay for.
   */
  reason?: "unreviewed" | "unpaid";
}, copy: CopyOf<"hold_expired"> = defaultEmailCopy(RESULT_EMAIL_COPY.hold_expired)): RenderedEmail {
  const restartPath = p.productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const restartUrl = `${p.origin}${restartPath}`;
  const url = p.accessToken ? statusUrl(p.origin, p.resultId, p.accessToken) : restartUrl;
  // Reorder needs a status page to land on, and `url` degrades to the
  // configurator when there is no token — a "Reorder this build" button that
  // opened a blank questionnaire would promise exactly what the feature exists
  // to remove. Without a token there is no way back to the build, so say so.
  const canReorder = p.reason === "unpaid" && p.accessToken != null;
  const unpaid = p.reason === "unpaid";
  const values = { status_page_link: STATUS_PAGE_LABEL };
  const t = filled(copy, values);

  const subject = unpaid ? t.subject_unpaid : t.subject_unreviewed;
  const lead = unpaid ? t.lead_unpaid : t.lead_unreviewed;
  const closing = canReorder ? t.closing_reorder : unpaid ? t.closing_unpaid : null;

  const text = [
    lead,
    ...(closing ? ["", closing] : []),
    "",
    ...(canReorder
      ? [`${t.button_reorder}:`, reorderUrl(url), "", "Or start from scratch:", restartUrl]
      : // The HTML still links the status page here, and the text body has to
        // carry every link the HTML does.
        [`${t.button_restart}:`, restartUrl, "", `Status page: ${url}`]),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: t.preheader,
    bodyHtml: `${statusPill("Hold released", "neutral")}
${paragraph(lead, { top: 16 })}
${closing ? paragraph(closing, { muted: true }) : ""}
${
      // The plain-text body has always linked the status page; the old HTML
      // dropped it, then carried it as unlinked text. Keep both in step, and
      // make it clickable — a URL printed as prose is not a link.
      copy.status_line
        ? paragraphHtml(withLink(copy.status_line, values, "status_page_link", { href: url, label: STATUS_PAGE_LABEL }), {
            muted: true,
          })
        : ""
    }`,
    cta: canReorder
      ? { href: reorderUrl(url), label: t.button_reorder }
      : { href: restartUrl, label: t.button_restart },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// Paired build: the Mbolster dropped out, the Mpillow carries on (ADR 0026)
// ------------------------------------------------------------

/**
 * The Mbolster of a Paired build ended on its own — Staff cancelled it, or it
 * was not reviewed in time — while its Mpillow carries on. The hold stays for
 * the Mpillow, so this never claims a release. When the Mpillow is already
 * built, it is also the "ready" email the customer was waiting for: that one
 * waits until no build is still being made.
 */
export function renderPairedMbolsterRemovedEmail(p: {
  origin: string;
  /** The Mpillow's Result: where the customer reviews and accepts. */
  anchorId: string;
  accessToken: string | null;
  /** The Mpillow is assigned and can be accepted now. */
  anchorReady: boolean;
  /** The Mpillow's total, when it is ready. */
  amount: number | null;
  currency: string;
}, copy: CopyOf<"paired_mbolster_removed"> = defaultEmailCopy(RESULT_EMAIL_COPY.paired_mbolster_removed)): RenderedEmail {
  const url = statusUrl(p.origin, p.anchorId, p.accessToken);
  const t = filled(copy, {});
  const subject = p.anchorReady ? t.subject_ready : t.subject_waiting;
  const lead = p.anchorReady ? t.lead_ready : t.lead_waiting;
  const total =
    p.anchorReady && p.amount != null ? `Mpillow total: ${money(p.amount, p.currency)}` : null;

  const text = [lead, ...(total ? ["", total] : []), "", `Status page: ${url}`].join("\n");
  const html = renderEmailShell({
    title: subject,
    preheader: p.anchorReady ? t.preheader_ready : t.preheader_waiting,
    bodyHtml: `${paragraph(lead)}
${total ? paragraph(total, { muted: true }) : ""}`,
    cta: { href: url, label: p.anchorReady ? t.button_ready : t.button_waiting },
  });
  return { subject, text, html };
}

// ------------------------------------------------------------
// Pre-order stock recovered → restock notice
// ------------------------------------------------------------

export function renderRestockEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string | null;
}, copy: CopyOf<"restocked"> = defaultEmailCopy(RESULT_EMAIL_COPY.restocked)): RenderedEmail {
  const loginUrl = `${p.origin}/account/login`;
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const values = { status_page_link: STATUS_PAGE_LABEL };
  const t = filled(copy, values);

  const text = [t.intro, "", t.sign_in, loginUrl, "", `Status page: ${url}`].join("\n");

  const html = renderEmailShell({
    title: t.subject,
    preheader: t.preheader,
    bodyHtml: `${statusPill("Restocked", "success")}
${paragraph(t.intro, { top: 16 })}
${paragraph(t.sign_in, { muted: true })}
${
      copy.status_line
        ? paragraphHtml(withLink(copy.status_line, values, "status_page_link", { href: url, label: STATUS_PAGE_LABEL }), {
            muted: true,
          })
        : ""
    }`,
    cta: { href: loginUrl, label: t.button },
  });

  return { subject: t.subject, text, html };
}
