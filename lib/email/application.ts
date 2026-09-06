// ============================================================
// Partner application outcome emails
// ============================================================
//
// These live here rather than in lib/partner-application/index.ts because that
// module is deliberately import-pure — the apply form and the agreement page are
// client components, so pulling the email design system in there would ship it
// to the browser.
//
// Returns a FULLY SHELLED email. The caller sends it as-is; wrapping it again
// would nest one <html> document inside another.

import { renderEmailShell } from "./base";
import { link, paragraph, paragraphHtml, statusPill } from "./components";
import type { ApplicationOutcome } from "@/lib/partner-application";
import type { RenderedEmail } from "./types";

export function renderApplicationOutcomeEmail(
  outcome: ApplicationOutcome,
  opts: { partnerSignInUrl: string; supportEmail: string },
): RenderedEmail {
  const supportLink = link({
    href: `mailto:${opts.supportEmail}`,
    label: opts.supportEmail,
  });

  if (outcome === "approved") {
    return {
      subject: "You're approved — welcome to the Mpillow Partner programme",
      text: `Good news — your Mpillow Partner application has been approved.

Sign in to your Partner Hub to get started:
${opts.partnerSignInUrl}

Questions? Reply to this email or reach us at ${opts.supportEmail}.

— The Mpillow team`,
      html: renderEmailShell({
        title: "You're approved",
        preheader: "Welcome to the Mpillow Partner programme.",
        audience: "partner",
        bodyHtml: `${statusPill("Approved", "success")}
${paragraph("Good news — your Mpillow Partner application has been approved.", {
          top: 16,
        })}
${paragraphHtml(`Questions? Reply to this email or reach us at ${supportLink}.`, {
          muted: true,
        })}
${paragraph("— The Mpillow team", { muted: true })}`,
        cta: { href: opts.partnerSignInUrl, label: "Sign in to your Partner Hub" },
      }),
    };
  }

  return {
    subject: "An update on your Mpillow Partner application",
    text: `Thank you for your interest in the Mpillow Partner programme.

After reviewing your application, we're not able to move forward at this time.

If you think this was a mistake or your details have changed, reply to this email or contact us at ${opts.supportEmail}.

— The Mpillow team`,
    html: renderEmailShell({
      title: "An update on your application",
      preheader: "An update on your Mpillow Partner application.",
      audience: "partner",
      bodyHtml: `${paragraph(
        "Thank you for your interest in the Mpillow Partner programme.",
      )}
${paragraph(
        "After reviewing your application, we're not able to move forward at this time.",
      )}
${paragraphHtml(
        `If you think this was a mistake or your details have changed, reply to this email or contact us at ${supportLink}.`,
        { muted: true },
      )}
${paragraph("— The Mpillow team", { muted: true })}`,
    }),
  };
}
