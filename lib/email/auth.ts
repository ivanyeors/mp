// ============================================================
// Identity / verification emails sent by our own code
// ============================================================
//
// Supabase's own auth emails (magic link, confirm signup, invite, password
// reset) are NOT sent from here — they live in the hosted dashboard. The
// branded HTML for those is generated into supabase/templates/ by
// scripts/build-auth-email-templates.ts; see that directory's README.

import { renderEmailShell } from "./base";
import { codeBlock, infoList, paragraph } from "./components";
import type { RenderedEmail } from "./types";

/** Backup-email verification code for a Partner account. */
export function renderBackupEmailOtpEmail(p: {
  code: string;
  expiresInMinutes?: number;
}): RenderedEmail {
  const minutes = p.expiresInMinutes ?? 10;
  const subject = "Verify your backup email";
  const text = `Your Mpillow Partner backup-email verification code is: ${p.code}

It expires in ${minutes} minutes. If you didn't request this, ignore this email.`;

  const html = renderEmailShell({
    title: "Verify your backup email",
    preheader: `Your verification code expires in ${minutes} minutes.`,
    audience: "partner",
    bodyHtml: `${paragraph("Your Mpillow Partner backup-email verification code is:")}
${codeBlock(p.code, { caption: `Expires in ${minutes} minutes` })}
${paragraph("If you didn't request this, you can safely ignore this email.", {
      muted: true,
    })}`,
  });

  return { subject, text, html };
}

/**
 * An Admin Panel invite (Users & permissions → Members). There is no token:
 * signing in with the invited address — Google or an emailed link — is what
 * binds the login, so the button only takes them to Sign in.
 */
export function renderAdminInviteEmail(p: {
  inviterEmail: string;
  invitedEmail: string;
  roleName: string;
  signInUrl: string;
}): RenderedEmail {
  const subject = "You're invited to the Mpillow Admin Panel";
  const text = `${p.inviterEmail} invited you to the Mpillow Admin Panel as ${p.roleName}.

Sign in with ${p.invitedEmail}:
${p.signInUrl}

Google or an emailed sign-in link both work, as long as the address is ${p.invitedEmail}. If you weren't expecting this, you can ignore this email.`;

  const html = renderEmailShell({
    title: "You're invited to the Admin Panel",
    preheader: `${p.inviterEmail} invited you as ${p.roleName}.`,
    audience: "staff",
    bodyHtml: `${paragraph(`${p.inviterEmail} invited you to the Mpillow Admin Panel.`)}
${infoList([
      { label: "Role", value: p.roleName },
      { label: "Sign in as", value: p.invitedEmail },
    ])}
${paragraph(
      `Google or an emailed sign-in link both work, as long as the address is ${p.invitedEmail}. If you weren't expecting this, you can ignore this email.`,
      { muted: true },
    )}`,
    cta: { href: p.signInUrl, label: `Sign in with ${p.invitedEmail}` },
  });

  return { subject, text, html };
}
