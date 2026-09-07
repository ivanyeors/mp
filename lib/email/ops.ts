// ============================================================
// Internal / staff notification emails
// ============================================================
//
// Ops mail uses `audience: "staff"`, which drops the marketing footer links and
// social row — internal notices should not look like customer marketing.

import { renderEmailShell } from "./base";
import { codeBlock, infoList, paragraph, statusPill } from "./components";
import type { RenderedEmail } from "./types";

/** A partner edited their public listing; staff can hide it in one click. */
export function renderPartnerListingUpdatedEmail(p: {
  partnerName: string;
  hideUrl: string;
}): RenderedEmail {
  const subject = `Partner listing updated: ${p.partnerName}`;
  const text = `${p.partnerName} updated their public partner listing (/our-partners).

Review it in Partners, or open the hide-confirmation page:
${p.hideUrl}`;

  const html = renderEmailShell({
    title: "Partner listing updated",
    preheader: `${p.partnerName} updated their public listing.`,
    audience: "staff",
    bodyHtml: `${statusPill("Internal", "neutral")}
${paragraph(
      `${p.partnerName} updated their public partner listing (/our-partners).`,
      { top: 16 },
    )}
${paragraph(
      "Opens a confirmation page; you must be signed in as Staff to hide it.",
      { muted: true },
    )}`,
    cta: { href: p.hideUrl, label: "Review & hide this listing" },
  });

  return { subject, text, html };
}

/** A held Result has passed its SLA and still needs operator review. */
export function renderHeldResultReminderEmail(p: {
  resultId: string;
  platformUrl: string;
  customerEmail: string | null;
  heldAt: string;
}): RenderedEmail {
  const subject = "Held Result still needs review";
  const text = [
    "Reminder: a held Result is still waiting for operator review.",
    "",
    `Result: ${p.resultId}`,
    `Customer: ${p.customerEmail ?? "—"}`,
    `Held since: ${p.heldAt}`,
    "",
    `Platform: ${p.platformUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: "Held Result still needs review",
    preheader: `Result ${p.resultId} is still waiting for operator review.`,
    audience: "staff",
    bodyHtml: `${statusPill("Internal", "neutral")}
${paragraph("A held Result is still waiting for operator review.", { top: 16 })}
${codeBlock(p.resultId, { caption: "Result id", variant: "identifier" })}
${infoList([
      { label: "Customer", value: p.customerEmail ?? "—" },
      { label: "Held since", value: p.heldAt },
    ])}`,
    cta: { href: p.platformUrl, label: "Open on platform" },
  });

  return { subject, text, html };
}
