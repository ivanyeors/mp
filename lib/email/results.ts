// ============================================================
// Customisation (Result) lifecycle emails
// ============================================================
//
// These used to live as bare <p> fragments inside the API routes — no <html>
// document, no branding, and user-controlled strings interpolated straight into
// HTML. Rendering now happens here, through the shared shell and the escaping
// components, so route files only send.
//
// Every renderer is pure: (data) -> RenderedEmail. The routes keep their own
// try/catch and their "sent" | "failed" return contract.

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
import { money } from "./format";
import { LAYOUT, SPACE } from "./theme";
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

function cancelUrl(url: string): string {
  return `${url}${DECIDE_ANCHOR}`;
}

/** Muted "changed your mind" line for the emails that ask for money. */
function cancelLineHtml(url: string): string {
  return paragraphHtml(
    `Changed your mind? You can ${link({ href: cancelUrl(url), label: "cancel this order" })} on the same page.`,
    { muted: true, top: 4 },
  );
}

function cancelLineText(url: string): string[] {
  return ["", "Changed your mind? Cancel this order:", cancelUrl(url)];
}

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
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const amount = p.amount == null ? null : money(p.amount, p.currency);
  const subject = amount
    ? `Your ${name} is under review`
    : `We've received your ${name} measurements`;
  const trackLabel = amount ? "Track your review status" : "Track your build";
  const closing = amount
    ? "You will be able to accept or decline once an operator finishes review."
    : `Our team is making your ${name} now. We'll email you when it's ready, with the final price.`;

  const text = [
    `Thanks for submitting your custom ${name}.`,
    "",
    p.label,
    ...(amount ? [`Authorized amount: ${amount} (not charged yet)`] : []),
    "",
    `${trackLabel}:`,
    url,
    "",
    closing,
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: amount
      ? `We've received your custom ${name}. Nothing has been charged yet.`
      : `We've received your custom ${name}. There's nothing to pay yet.`,
    bodyHtml: `${statusPill(amount ? "Under review" : "Being made", "warning")}
${paragraph(`Thanks for submitting your custom ${name}.`, { top: 16 })}
${infoList([{ label: "Configuration", value: p.label }])}
${
      amount
        ? amountPanel({
            label: "Authorized amount",
            amount,
            caption: "Not charged yet — we only capture payment once you accept.",
          })
        : ""
    }
${paragraph(closing, { muted: true })}`,
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
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  // One renderer, three voices — the spec rows are shared so they cannot drift;
  // only the ask and how much of the price is known differ.
  const hasHold = p.pricing?.authorized != null;
  const finish = Boolean(p.needsFinish) && !hasHold;
  const subject = hasHold
    ? "Your final build is ready"
    : finish
      ? "Your build is ready — choose your finish"
      : "Your final build is ready — payment due";
  const reviewLabel = hasHold
    ? "Review and accept or decline:"
    : finish
      ? "Choose your cover, case and shipping:"
      : "Review and pay:";
  const ctaLabel = hasHold ? "Review your final build" : finish ? "Choose your finish" : "Review and pay";
  const closing = hasHold
    ? "Accept or decline on the status page. Accept captures payment; Decline releases your hold."
    : finish
      ? "Our team has built your fillings. Choose your cover, case and shipping to see your final price, then pay to confirm your order. Nothing is charged until you do."
      : "Review your build on the status page and pay there to confirm your order. Nothing is charged until you do.";
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
        `Subtotal: ${money(p.pricing.subtotal, p.pricing.currency)}`,
        `Shipping: ${money(p.pricing.shipping, p.pricing.currency)}`,
        `Tax: ${money(p.pricing.tax, p.pricing.currency)}`,
        `Total: ${money(p.pricing.total, p.pricing.currency)}`,
        p.pricing.authorized != null
          ? `Authorized hold: ${money(p.pricing.authorized, p.pricing.currency)}`
          : null,
      ].filter((line): line is string => Boolean(line))
    : [];

  const text = [
    `Your final ${name} build is ready for review.`,
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
    reviewLabel,
    url,
    ...cancelLineText(url),
  ].join("\n");

  // Build spec. `fillingSummary` / `preferences` / `addons` come from
  // admin-editable item names, so they MUST go through an escaping component —
  // they were interpolated raw before this module existed.
  const specRows = [
    ...(p.productType === "bolster"
      ? [{ label: "Length", value: p.length ?? "—" }]
      : [
          { label: "Size", value: p.size ?? "—" },
          { label: "Tier", value: p.tier ?? "—" },
        ]),
  ];

  const pricingRows = finish
    ? p.pricing
      ? [{ label: "From (before shipping)", value: money(p.pricing.subtotal, p.pricing.currency), strong: true }]
      : []
    : p.pricing
    ? [
        { label: "Subtotal", value: money(p.pricing.subtotal, p.pricing.currency) },
        { label: "Shipping", value: money(p.pricing.shipping, p.pricing.currency) },
        { label: "Tax", value: money(p.pricing.tax, p.pricing.currency) },
        { label: "Total", value: money(p.pricing.total, p.pricing.currency), strong: true },
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

  // Asymmetric spacing binds each label to the list it introduces. With
  // heading()'s flat `0 0 16px` the three labels sat equidistant between the
  // lists and read as belonging to neither.
  const section = (label: string, items: string[]): string =>
    items.length > 0
      ? `${heading(label, 3, { top: LAYOUT.gutter, bottom: SPACE.sm })}${bulletList(items)}`
      : "";

  const html = renderEmailShell({
    title: subject,
    preheader: hasHold
      ? `Your final ${name} build is ready for you to accept or decline.`
      : finish
        ? `Your ${name} fillings are built — choose your cover, case and shipping.`
        : `Your final ${name} build is priced and ready — review it and pay to confirm.`,
    bodyHtml: `${paragraph(`Your final ${name} build is ready for review.`)}
${infoList(specRows)}
${section("Fillings", p.fillingSummary)}
${section("Preferences", p.preferences)}
${section("Add-ons", p.addons)}
${pricingRows.length > 0 ? infoList(pricingRows) : ""}
${paragraph(closing, { muted: true })}
${cancelLineHtml(url)}`,
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
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const subject = `Your ${name} is built and waiting`;

  if (p.needsFinish) {
    const text = [
      `Your custom ${name} fillings are built and waiting for you.`,
      "",
      "Choose your cover, case and shipping:",
      url,
      "",
      "Nothing has been charged yet.",
      ...cancelLineText(url),
    ].join("\n");
    const html = renderEmailShell({
      title: subject,
      preheader: `Your ${name} is ready — choose your finish to see the final price.`,
      bodyHtml: `${statusPill("Choose your finish", "warning")}
${paragraph(`Your custom ${name} fillings are built and waiting for you.`, { top: 16 })}
${paragraphHtml(
        `Choose your cover, case and shipping on its ${link({ href: url, label: STATUS_PAGE_LABEL })} to see your final price. Nothing is charged until you pay.`,
        { muted: true },
      )}
${cancelLineHtml(url)}`,
      cta: { href: url, label: "Choose your finish" },
    });
    return { subject, text, html };
  }

  const total = p.amount == null ? null : money(p.amount, p.currency);

  const text = [
    `Your custom ${name} is finished and waiting for payment.`,
    "",
    ...(total ? [`Total: ${total}`] : []),
    "",
    "Review the build and pay:",
    url,
    "",
    "Nothing has been charged yet.",
    ...cancelLineText(url),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: `Your ${name} is ready — it just needs payment to go into production.`,
    bodyHtml: `${statusPill("Payment due", "warning")}
${paragraph(`Your custom ${name} is finished and waiting for payment.`, { top: 16 })}
${
      total
        ? amountPanel({
            label: "Total",
            amount: total,
            caption: "Nothing charged yet — payment confirms your order.",
          })
        : ""
    }
${paragraphHtml(
      `Review the full build on its ${link({ href: url, label: STATUS_PAGE_LABEL })} and pay there to send it into production.`,
      { muted: true },
    )}
${cancelLineHtml(url)}`,
    cta: { href: url, label: "Review and pay" },
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
}): RenderedEmail {
  const name = productName(p.productType);
  // Derived, not passed: same as renderHoldExpiredEmail. A caller-supplied path
  // would be an unescaped fragment of an href for no benefit — product_type is
  // already the only thing that decides it.
  const restartPath = p.productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const restartHref = `${p.origin}${restartPath}`;
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const subject = `Your ${name} order is cancelled`;
  const released = p.releasedAmount == null ? null : money(p.releasedAmount, p.currency);

  const moneyLine = released
    ? `Your card was never charged. The ${released} authorization hold has been released — depending on your bank it can take a few days to disappear from your statement.`
    : "Nothing was charged, and there is nothing outstanding.";

  const text = [
    `Your custom ${name} order has been cancelled, as you asked.`,
    "",
    moneyLine,
    "",
    "Changed your mind? You can start a new customisation anytime:",
    restartHref,
    "",
    "This cancelled order stays on its status page:",
    url,
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: `Your ${name} order is cancelled. Nothing was charged.`,
    bodyHtml: `${statusPill("Cancelled", "neutral")}
${paragraph(`Your custom ${name} order has been cancelled, as you asked.`, { top: 16 })}
${paragraph(moneyLine, { muted: true })}
${paragraph("Changed your mind? You can start a new customisation whenever you like.", { muted: true })}
${paragraphHtml(
      `This cancelled order stays on its ${link({ href: url, label: STATUS_PAGE_LABEL })} for your records.`,
      { muted: true, top: 4 },
    )}`,
    cta: { href: restartHref, label: `Start a new ${name}` },
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
}): RenderedEmail {
  const restartPath = p.productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const restartUrl = `${p.origin}${restartPath}`;
  const url = p.accessToken ? statusUrl(p.origin, p.resultId, p.accessToken) : restartUrl;
  const unpaid = p.reason === "unpaid";

  const subject = unpaid
    ? "Your customisation hold has expired — nothing was charged"
    : "Your customisation hold has expired";
  const lead = unpaid
    ? "Your final build was ready, but it was not paid for in time, so your card authorization hold has been released. Nothing was charged."
    : "Your customisation review window has expired and your card authorization hold has been released.";
  const closing = unpaid
    ? "The build itself is not lost — get in touch and we can put the same one back together for you, or start again below."
    : null;

  const text = [
    lead,
    ...(closing ? ["", closing] : []),
    "",
    "To continue, start customisation again:",
    restartUrl,
    "",
    `Status page: ${url}`,
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: "Your authorization hold has been released — nothing was charged.",
    bodyHtml: `${statusPill("Hold released", "neutral")}
${paragraph(lead, { top: 16 })}
${closing ? paragraph(closing, { muted: true }) : ""}
${paragraphHtml(
      // The plain-text body has always linked the status page; the old HTML
      // dropped it, then carried it as unlinked text. Keep both in step, and
      // make it clickable — a URL printed as prose is not a link.
      `You can still view this customisation on its ${link({ href: url, label: STATUS_PAGE_LABEL })}.`,
      { muted: true },
    )}`,
    cta: { href: restartUrl, label: "Start customisation again" },
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
}): RenderedEmail {
  const loginUrl = `${p.origin}/account/login`;
  const url = statusUrl(p.origin, p.resultId, p.accessToken);

  const text = [
    "Good news — the inventory for your customisation has been restocked.",
    "",
    "Sign in in a few days to track your customisation (Result) status:",
    loginUrl,
    "",
    `Status page: ${url}`,
  ].join("\n");

  const html = renderEmailShell({
    title: "Your customisation has been restocked",
    preheader: "The inventory for your customisation is back in stock.",
    bodyHtml: `${statusPill("Restocked", "success")}
${paragraph(
      "Good news — the inventory for your customisation has been restocked.",
      { top: 16 },
    )}
${paragraph(
      "Sign in in a few days to track your customisation (Result) status.",
      { muted: true },
    )}
${paragraphHtml(
      `You can also view this customisation on its ${link({ href: url, label: STATUS_PAGE_LABEL })}.`,
      { muted: true },
    )}`,
    cta: { href: loginUrl, label: "Sign in" },
  });

  return { subject: "Your customisation has been restocked", text, html };
}
