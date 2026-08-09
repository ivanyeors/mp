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
import { moneyWithCode } from "./format";
import type { RenderedEmail } from "./types";

/** Human product name from the stored product type. */
function productName(productType: string | null): string {
  return productType === "bolster" ? "Mbolster" : "Mpillow";
}

function statusUrl(origin: string, resultId: string, accessToken: string | null): string {
  const base = `${origin}/results/${encodeURIComponent(resultId)}`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

// ------------------------------------------------------------
// Authorization hold placed → "under review"
// ------------------------------------------------------------

export function renderResultHeldEmail(p: {
  origin: string;
  resultId: string;
  accessToken: string;
  productType: "pillow" | "bolster";
  label: string;
  amount: number;
  currency: string;
}): RenderedEmail {
  const name = productName(p.productType);
  const url = statusUrl(p.origin, p.resultId, p.accessToken);
  const amount = moneyWithCode(p.amount, p.currency);
  const subject = `Your ${name} is under review`;

  const text = [
    `Thanks for submitting your custom ${name}.`,
    "",
    p.label,
    `Authorized amount: ${amount} (not charged yet)`,
    "",
    "Track your review status:",
    url,
    "",
    "You will be able to accept or decline once an operator finishes review.",
  ].join("\n");

  const html = renderEmailShell({
    title: `Your ${name} is under review`,
    preheader: `We've received your custom ${name}. Nothing has been charged yet.`,
    bodyHtml: `${statusPill("Under review", "warning")}
${paragraph(`Thanks for submitting your custom ${name}.`, { top: 16 })}
${infoList([{ label: "Configuration", value: p.label }])}
${amountPanel({
      label: "Authorized amount",
      amount,
      caption: "Not charged yet — we only capture payment once you accept.",
    })}
${paragraph(
      "You will be able to accept or decline once an operator finishes review.",
      { muted: true },
    )}`,
    cta: { href: url, label: "Track your review status" },
  });

  return { subject, text, html };
}

// ------------------------------------------------------------
// Operator assigned the final build → "ready for review"
// ------------------------------------------------------------

export interface ResultPricing {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
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
  const sizeLine =
    p.productType === "bolster"
      ? `Length: ${p.length ?? "—"}`
      : `Size: ${p.size ?? "—"} · Tier: ${p.tier ?? "—"}`;

  const priceLines = p.pricing
    ? [
        `Subtotal: ${moneyWithCode(p.pricing.subtotal, p.pricing.currency)}`,
        `Shipping: ${moneyWithCode(p.pricing.shipping, p.pricing.currency)}`,
        `Tax: ${moneyWithCode(p.pricing.tax, p.pricing.currency)}`,
        `Total: ${moneyWithCode(p.pricing.total, p.pricing.currency)}`,
        p.pricing.authorized != null
          ? `Authorized hold: ${moneyWithCode(p.pricing.authorized, p.pricing.currency)}`
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
    "Review and accept or decline:",
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
        { label: "Subtotal", value: moneyWithCode(p.pricing.subtotal, p.pricing.currency) },
        { label: "Shipping", value: moneyWithCode(p.pricing.shipping, p.pricing.currency) },
        { label: "Tax", value: moneyWithCode(p.pricing.tax, p.pricing.currency) },
        { label: "Total", value: moneyWithCode(p.pricing.total, p.pricing.currency), strong: true },
        ...(p.pricing.authorized != null
          ? [
              {
                label: "Authorized hold",
                value: moneyWithCode(p.pricing.authorized, p.pricing.currency),
              },
            ]
          : []),
      ]
    : [];

  const section = (label: string, items: string[]): string =>
    items.length > 0 ? `${heading(label, 3)}${bulletList(items)}` : "";

  const html = renderEmailShell({
    title: "Your final build is ready",
    preheader: `Your final ${name} build is ready for you to accept or decline.`,
    bodyHtml: `${paragraph(`Your final ${name} build is ready for review.`)}
${infoList(specRows)}
${section("Fillings", p.fillingSummary)}
${section("Preferences", p.preferences)}
${section("Add-ons", p.addons)}
${pricingRows.length > 0 ? infoList(pricingRows) : ""}
${paragraph(
      "Accept or decline on the status page. Accept captures payment; Decline releases your hold.",
      { muted: true },
    )}`,
    cta: { href: url, label: "Review your final build" },
  });

  return { subject: "Your final build is ready", text, html };
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
${paragraph(
      // The plain-text body has always linked the status page; the old HTML
      // dropped it. Keep both in step.
      `You can still view this customisation on its status page: ${url}`,
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
${paragraphHtml(`Status page: ${link({ href: url, label: url })}`, { muted: true })}`,
    cta: { href: loginUrl, label: "Sign in" },
  });

  return { subject: "Your customisation has been restocked", text, html };
}
