import { renderEmailShell } from "./base";
import { codeBlock, infoList, paragraph, statusPill } from "./components";
import type { RenderedEmail } from "./types";

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
