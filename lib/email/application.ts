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
import {
  defaultEmailCopy,
  defineEmailCopy,
  fillCopy,
  type CopyField,
  type EmailCopy,
  type EmailCopySpec,
} from "./copy";
import { escapeHtml } from "./html";
import type { ApplicationOutcome } from "@/lib/partner-application";
import type { RenderedEmail } from "./types";

type Opts = { partnerSignInUrl: string; supportEmail: string };

// ------------------------------------------------------------
// The words of each outcome (PRD-email-templates)
// ------------------------------------------------------------
//
// One renderer serves both outcomes, but Staff edit each as its own email, so
// each has its own spec. The support address is data: {support_email} is the
// mailto link in the HTML, and the address itself in the plain text.

const APPLICATION_PLACEHOLDERS = {
  support_email: "Our support address, e.g. sg@mpillow.com. In the email it is a link that starts a message to us.",
};

const SIGNOFF: CopyField = { label: "Sign-off", default: "— The Mpillow team", optional: true };

export const APPLICATION_EMAIL_COPY = {
  approved: defineEmailCopy({
    id: "application.approved",
    name: "Partner application approved",
    description: "Sent to an applicant when Staff approve their Partner application, with the link to sign in to the Partner Hub.",
    placeholders: APPLICATION_PLACEHOLDERS,
    fields: {
      subject: { label: "Subject", default: "You're approved — welcome to the Mpillow Partner programme" },
      preheader: { label: "Inbox preview line", default: "Welcome to the Mpillow Partner programme." },
      heading: { label: "Heading", default: "You're approved" },
      intro: { label: "Message", default: "Good news — your Mpillow Partner application has been approved." },
      questions: {
        label: "Questions line",
        default: "Questions? Reply to this email or reach us at {support_email}.",
        optional: true,
      },
      button: { label: "Button", default: "Sign in to your Partner Hub" },
      signoff: SIGNOFF,
    },
  }),
  rejected: defineEmailCopy({
    id: "application.rejected",
    name: "Partner application declined",
    description: "Sent to an applicant when Staff decline their Partner application.",
    placeholders: APPLICATION_PLACEHOLDERS,
    fields: {
      subject: { label: "Subject", default: "An update on your Mpillow Partner application" },
      preheader: { label: "Inbox preview line", default: "An update on your Mpillow Partner application." },
      heading: { label: "Heading", default: "An update on your application" },
      intro: { label: "Opening line", default: "Thank you for your interest in the Mpillow Partner programme." },
      message: { label: "Message", default: "After reviewing your application, we're not able to move forward at this time." },
      contact: {
        label: "Contact line",
        default: "If you think this was a mistake or your details have changed, reply to this email or contact us at {support_email}.",
        optional: true,
      },
      signoff: SIGNOFF,
    },
  }),
} satisfies Record<ApplicationOutcome, EmailCopySpec>;

type CopyOf<T extends ApplicationOutcome> = EmailCopy<keyof (typeof APPLICATION_EMAIL_COPY)[T]["fields"] & string>;

/** Fill every field of `copy` from `values`. */
function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

/** An unfilled field as HTML: escaped, with each {support_email} as the mailto link. */
function withSupportLink(text: string, opts: Opts): string {
  const supportLink = link({ href: `mailto:${opts.supportEmail}`, label: opts.supportEmail });
  return text.split("{support_email}").map(escapeHtml).join(supportLink);
}

/** The sign-off, as the last lines of a plain-text body; none when Staff removed it. */
const signoffText = (signoff: string) => (signoff ? ["", signoff] : []);

function approved(opts: Opts, copy: CopyOf<"approved"> = defaultEmailCopy(APPLICATION_EMAIL_COPY.approved)): RenderedEmail {
  const t = filled(copy, { support_email: opts.supportEmail });
  return {
    subject: t.subject,
    text: [
      t.intro,
      "",
      `${t.button}: ${opts.partnerSignInUrl}`,
      ...(t.questions ? ["", t.questions] : []),
      ...signoffText(t.signoff),
    ].join("\n"),
    html: renderEmailShell({
      title: t.heading,
      preheader: t.preheader,
      audience: "partner",
      bodyHtml: `${statusPill("Approved", "success")}
${paragraph(t.intro, { top: 16 })}
${t.questions ? paragraphHtml(withSupportLink(copy.questions, opts), { muted: true }) : ""}
${t.signoff ? paragraph(t.signoff, { muted: true }) : ""}`,
      cta: { href: opts.partnerSignInUrl, label: t.button },
    }),
  };
}

function rejected(opts: Opts, copy: CopyOf<"rejected"> = defaultEmailCopy(APPLICATION_EMAIL_COPY.rejected)): RenderedEmail {
  const t = filled(copy, { support_email: opts.supportEmail });
  return {
    subject: t.subject,
    text: [
      t.intro,
      "",
      t.message,
      ...(t.contact ? ["", t.contact] : []),
      ...signoffText(t.signoff),
    ].join("\n"),
    html: renderEmailShell({
      title: t.heading,
      preheader: t.preheader,
      audience: "partner",
      bodyHtml: `${paragraph(t.intro)}
${paragraph(t.message)}
${t.contact ? paragraphHtml(withSupportLink(copy.contact, opts), { muted: true }) : ""}
${t.signoff ? paragraph(t.signoff, { muted: true }) : ""}`,
    }),
  };
}

/**
 * The outcome's email. `copy` is that outcome's words
 * (`APPLICATION_EMAIL_COPY[outcome]`); without it, the default words.
 */
export function renderApplicationOutcomeEmail(
  outcome: ApplicationOutcome,
  opts: Opts,
  copy?: EmailCopy,
): RenderedEmail {
  return outcome === "approved"
    ? approved(opts, copy as CopyOf<"approved"> | undefined)
    : rejected(opts, copy as CopyOf<"rejected"> | undefined);
}
