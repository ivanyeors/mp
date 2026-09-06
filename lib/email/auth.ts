// ============================================================
// Identity / verification emails sent by our own code
// ============================================================
//
// Supabase's own auth emails (magic link, confirm signup, invite, password
// reset) are NOT sent from here — they live in the hosted dashboard. The
// branded HTML for those is generated into supabase/templates/ by
// scripts/build-auth-email-templates.ts; see that directory's README.

import { renderEmailShell } from "./base";
import { codeBlock, paragraph } from "./components";
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
