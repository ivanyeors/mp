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
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  // One renderer, two voices — the spec rows and the pricing block are shared so
  // they cannot drift; only the ask differs.
  const hasHold = p.pricing?.authorized != null;
  const subject = hasHold
    ? "Your final build is ready"
    : "Your final build is ready — payment due";
  const reviewLabel = hasHold ? "Review and accept or decline:" : "Review and pay:";
  const ctaLabel = hasHold ? "Review your final build" : "Review and pay";
  const closing = hasHold
    ? "Accept or decline on the status page. Accept captures payment; Decline releases your hold."
    : "Review your build on the status page and pay there to confirm your order. Nothing is charged until you do.";
  const sizeLine =
    p.productType === "bolster"
      ? `Length: ${p.length ?? "—"}`
      : `Size: ${p.size ?? "—"} · Tier: ${p.tier ?? "—"}`;

  const priceLines = p.pricing
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
    `Preferences: ${p.preferences.join(", ") || "—"}`,
    `Add-ons: ${p.addons.join(", ") || "—"}`,
    ...priceLines,
    "",
    reviewLabel,
    url,
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

  const pricingRows = p.pricing
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
      : `Your final ${name} build is priced and ready — review it and pay to confirm.`,
    bodyHtml: `${paragraph(`Your final ${name} build is ready for review.`)}
${infoList(specRows)}
${section("Fillings", p.fillingSummary)}
${section("Preferences", p.preferences)}
${section("Add-ons", p.addons)}
${pricingRows.length > 0 ? infoList(pricingRows) : ""}
${paragraph(closing, { muted: true })}`,
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
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const total = p.amount == null ? null : money(p.amount, p.currency);
  const subject = `Your ${name} is built and waiting`;

  const text = [
    `Your custom ${name} is finished and waiting for payment.`,
    "",
    ...(total ? [`Total: ${total}`] : []),
    "",
    "Review the build and pay:",
    url,
    "",
    "Nothing has been charged yet.",
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
    )}`,
    cta: { href: url, label: "Review and pay" },
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
}): RenderedEmail {
  const restartPath = p.productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const restartUrl = `${p.origin}${restartPath}`;
  const url = p.accessToken ? statusUrl(p.origin, p.resultId, p.accessToken) : restartUrl;

  const text = [
    "Your customisation review window has expired and your card authorization hold has been released.",
    "",
    "To continue, start customisation again:",
    restartUrl,
    "",
    `Status page: ${url}`,
  ].join("\n");

  const html = renderEmailShell({
    title: "Your customisation hold has expired",
    preheader: "Your authorization hold has been released — nothing was charged.",
    bodyHtml: `${statusPill("Hold released", "neutral")}
${paragraph(
      "Your customisation review window has expired and your card authorization hold has been released.",
      { top: 16 },
    )}
${paragraphHtml(
      // The plain-text body has always linked the status page; the old HTML
      // dropped it, then carried it as unlinked text. Keep both in step, and
      // make it clickable — a URL printed as prose is not a link.
      `You can still view this customisation on its ${link({ href: url, label: STATUS_PAGE_LABEL })}.`,
      { muted: true },
    )}`,
    cta: { href: restartUrl, label: "Start customisation again" },
  });

  return { subject: "Your customisation hold has expired", text, html };
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
