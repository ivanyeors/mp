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
  /**
   * Service fees inside `subtotal` (ADR 0024) — the Measurement service when Staff
   * measured. Listed on their own rows so the customer sees what they pay for.
   */
  services?: Array<{ label: string; amount: number }>;
}

/** One row per Service fee, before the Subtotal they are part of. */
function serviceRows(pricing: ResultPricing): Array<{ label: string; value: string }> {
  return (pricing.services ?? []).map((s) => ({ label: s.label, value: money(s.amount, pricing.currency) }));
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
        ...serviceRows(p.pricing).map((r) => `${r.label}: ${r.value}`),
        `Subtotal: ${money(p.pricing.subtotal, p.pricing.currency)}`,
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

  const specRows = buildSpecRows(p);

  const pricingRows = finish
    ? p.pricing
      ? [{ label: "From (before shipping)", value: money(p.pricing.subtotal, p.pricing.currency), strong: true }]
      : []
    : p.pricing
    ? [
        ...serviceRows(p.pricing),
        { label: "Subtotal", value: money(p.pricing.subtotal, p.pricing.currency) },
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
    preheader: hasHold
      ? `Your final ${name} build is ready for you to accept or decline.`
      : finish
        ? `Your ${name} fillings are built — choose your cover, case and shipping.`
        : `Your final ${name} build is priced and ready — review it and pay to confirm.`,
    bodyHtml: `${paragraph(`Your final ${name} build is ready for review.`)}
${infoList(specRows)}
${buildSectionsHtml(p)}
${pricingRows.length > 0 ? infoList(pricingRows) : ""}
${paragraph(closing, { muted: true })}
${cancelLineHtml(url)}`,
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
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const { currency, total } = p.pricing;
  const authorized = p.pricing.authorized;
  const hasHold = authorized != null;
  const subject = `Your ${name} build has been updated`;
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

  const closing = hasHold
    ? "Accept or decline on the status page. Accept captures payment; Decline releases your hold."
    : "Review the updated build on the status page and pay there to confirm your order. Nothing is charged until you do.";

  const text = [
    `We've updated your custom ${name}. Here is the build as it stands now.`,
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
    hasHold ? "Review and accept or decline:" : "Review and pay:",
    url,
    ...cancelLineText(url),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: priceChanged
      ? `Your ${name} build changed — here is the new spec and what it costs.`
      : `Your ${name} build changed — here is the updated spec.`,
    bodyHtml: `${statusPill("Updated", "warning")}
${paragraph(`We've updated your custom ${name}. Here is the build as it stands now.`, { top: 16 })}
${infoList(buildSpecRows(p))}
${buildSectionsHtml(p)}
${infoList(pricingRows)}
${amountPanel(moneyPanel)}
${paragraphHtml(
      `${closing} You can see the full build any time on its ${link({ href: url, label: STATUS_PAGE_LABEL })}.`,
      { muted: true },
    )}
${cancelLineHtml(url)}`,
    cta: { href: url, label: hasHold ? "Review your updated build" : "Review and pay" },
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
  // statusUrl without a token still resolves to the Result page, but a customer
  // arriving there unauthenticated cannot act on it — so the reorder CTA only
  // leads the email when the token is there to make it work.
  const canReorder = p.accessToken != null;
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
    ...(canReorder
      ? [
          "Changed your mind? You can reorder this exact build from its status page:",
          reorderUrl(url),
          "",
          "Or start a new customisation from scratch:",
          restartHref,
        ]
      : ["Changed your mind? You can start a new customisation anytime:", restartHref]),
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: `Your ${name} order is cancelled. Nothing was charged.`,
    bodyHtml: `${statusPill("Cancelled", "neutral")}
${paragraph(`Your custom ${name} order has been cancelled, as you asked.`, { top: 16 })}
${paragraph(moneyLine, { muted: true })}
${
      canReorder
        ? `${paragraph("Changed your mind? You do not have to start over — this exact build is still on its status page, and one button rebuilds it at today's prices.", { muted: true })}
${paragraphHtml(
            `Or ${link({ href: restartHref, label: "start a new customisation" })} from scratch.`,
            { muted: true, top: 4 },
          )}`
        : paragraph("Changed your mind? You can start a new customisation whenever you like.", { muted: true })
    }`,
    cta: canReorder
      ? { href: reorderUrl(url), label: `Reorder this ${name}` }
      : { href: restartHref, label: `Start a new ${name}` },
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
  // Reorder needs a status page to land on, and `url` degrades to the
  // configurator when there is no token — a "Reorder this build" button that
  // opened a blank questionnaire would promise exactly what the feature exists
  // to remove. Without a token there is no way back to the build, so say so.
  const canReorder = p.reason === "unpaid" && p.accessToken != null;
  const unpaid = p.reason === "unpaid";

  const subject = unpaid
    ? "Your customisation hold has expired — nothing was charged"
    : "Your customisation hold has expired";
  const lead = unpaid
    ? "Your final build was ready, but it was not paid for in time, so your card authorization hold has been released. Nothing was charged."
    : "Your customisation review window has expired and your card authorization hold has been released.";
  const closing = canReorder
    ? "The build itself is not lost. Reorder it from its status page and we will put the same one back together at today's prices — no need to answer the questions again."
    : unpaid
      ? "Nothing was charged, and there is nothing outstanding."
      : null;

  const text = [
    lead,
    ...(closing ? ["", closing] : []),
    "",
    ...(canReorder
      ? ["Reorder this build:", reorderUrl(url), "", "Or start from scratch:", restartUrl]
      : // The HTML still links the status page here, and the text body has to
        // carry every link the HTML does.
        ["To continue, start customisation again:", restartUrl, "", `Status page: ${url}`]),
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
    cta: canReorder
      ? { href: reorderUrl(url), label: "Reorder this build" }
      : { href: restartUrl, label: "Start customisation again" },
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
}): RenderedEmail {
  const url = statusUrl(p.origin, p.anchorId, p.accessToken);
  const subject = p.anchorReady
    ? "Your Mpillow is ready — your Mbolster was removed"
    : "Your Mbolster has been removed from your order";
  const lead = p.anchorReady
    ? "Your Mpillow is built and ready for you to review and accept. We could not go ahead with your Mbolster, so it has been removed from the order — nothing will be charged for it."
    : "We could not go ahead with your Mbolster, so it has been removed from your order. Nothing will be charged for it, and your Mpillow is unaffected.";
  const total =
    p.anchorReady && p.amount != null ? `Mpillow total: ${money(p.amount, p.currency)}` : null;

  const text = [lead, ...(total ? ["", total] : []), "", `Status page: ${url}`].join("\n");
  const html = renderEmailShell({
    title: subject,
    preheader: p.anchorReady
      ? "Your Mpillow is ready to review and accept."
      : "Your Mbolster was removed; your Mpillow is unaffected.",
    bodyHtml: `${paragraph(lead)}
${total ? paragraph(total, { muted: true }) : ""}`,
    cta: { href: url, label: p.anchorReady ? "Review your Mpillow" : "View your order" },
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
