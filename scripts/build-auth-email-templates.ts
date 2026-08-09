/**
 * Generate the Supabase auth email templates from the shared design system.
 *
 *   npx tsx scripts/build-auth-email-templates.ts
 *
 * Supabase's auth emails are NOT sent by our code — they are rendered by the
 * hosted project from templates stored in the dashboard. So this writes
 * paste-ready HTML into supabase/templates/ and the repo becomes the source of
 * truth; the dashboard is a copy. Re-run after any design-system change and
 * re-paste (see supabase/templates/README.md).
 *
 * Go placeholders survive by way of sentinels: safeUrl() would (correctly)
 * reject `{{ .ConfirmationURL }}` as a relative URL, so the templates render
 * with a real sentinel URL that is swapped for the placeholder afterwards. That
 * keeps safeUrl free of template-engine knowledge.
 */

process.env.NEXT_PUBLIC_SITE_URL ||= "https://custom.mpillow.com";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmailShell } from "../lib/email/base";
import { codeBlock, paragraph } from "../lib/email/components";

const SENTINEL_URL = "https://auth.sentinel.invalid/confirm";
const SENTINEL_TOKEN = "000000";

const OUT_DIR = join(process.cwd(), "supabase", "templates");

interface AuthTemplate {
  file: string;
  dashboardName: string;
  title: string;
  preheader: string;
  intro: string;
  ctaLabel: string;
  outro: string;
}

const TEMPLATES: AuthTemplate[] = [
  {
    file: "magic-link.html",
    dashboardName: "Magic Link",
    title: "Sign in to Mpillow",
    preheader: "Your sign-in code and link for Mpillow.",
    intro: "Use this code to sign in:",
    ctaLabel: "Or sign in with one click",
    outro: "If you didn't request this, you can safely ignore this email.",
  },
  {
    file: "confirm-signup.html",
    dashboardName: "Confirm signup",
    title: "Confirm your email",
    preheader: "Confirm your email to finish setting up your Mpillow account.",
    intro: "Use this code to confirm your email:",
    ctaLabel: "Or confirm with one click",
    outro: "If you didn't create an Mpillow account, you can ignore this email.",
  },
  {
    file: "invite-user.html",
    dashboardName: "Invite user",
    title: "You've been invited to Mpillow",
    preheader: "Accept your invitation to Mpillow.",
    intro: "Use this code to accept your invitation:",
    ctaLabel: "Or accept with one click",
    outro: "If you weren't expecting this invitation, you can ignore this email.",
  },
  {
    file: "reset-password.html",
    dashboardName: "Reset password",
    title: "Reset your password",
    preheader: "Reset the password on your Mpillow account.",
    intro: "Use this code to reset your password:",
    ctaLabel: "Or reset with one click",
    outro: "If you didn't request a password reset, you can ignore this email.",
  },
];

function render(t: AuthTemplate): string {
  const html = renderEmailShell({
    title: t.title,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${codeBlock(SENTINEL_TOKEN, { caption: "This code expires shortly" })}
${paragraph(t.outro, { muted: true })}`,
    cta: { href: SENTINEL_URL, label: t.ctaLabel },
  });

  // Swap sentinels for the Go placeholders Supabase substitutes at send time.
  return (
    html
      .split(SENTINEL_URL)
      .join("{{ .ConfirmationURL }}")
      .split(SENTINEL_TOKEN)
      .join("{{ .Token }}") + "\n"
  );
}

mkdirSync(OUT_DIR, { recursive: true });
for (const t of TEMPLATES) {
  const out = join(OUT_DIR, t.file);
  writeFileSync(out, render(t), "utf8");
  console.log(`wrote ${t.file}  →  dashboard template "${t.dashboardName}"`);
}
console.log(`\n${TEMPLATES.length} templates written to supabase/templates/`);
