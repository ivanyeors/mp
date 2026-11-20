import { renderEmailShell } from "./base";
import { codeBlock, infoList, paragraph } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import type { RenderedEmail } from "./types";

export const AUTH_EMAIL_COPY = {
  backup_email_otp: defineEmailCopy({
    id: "auth.backup_email_otp",
    name: "Backup email verification code",
    description: "Sent when a partner adds a backup email address, with the code that verifies it.",
    placeholders: { minutes: "How many minutes the code works for, e.g. 10" },
    fields: {
      subject: { label: "Subject", default: "Verify your backup email" },
      preheader: { label: "Inbox preview line", default: "Your verification code expires in {minutes} minutes." },
      heading: { label: "Heading", default: "Verify your backup email" },
      intro: { label: "Above the code", default: "Your Mpillow Partner backup-email verification code is:" },
      expiry: { label: "Under the code", default: "Expires in {minutes} minutes" },
      closing: { label: "Closing line", default: "If you didn't request this, you can safely ignore this email." },
    },
  }),
};

type BackupEmailOtpCopy = EmailCopy<keyof typeof AUTH_EMAIL_COPY.backup_email_otp.fields>;

function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

export function renderBackupEmailOtpEmail(
  p: {
    code: string;
    expiresInMinutes?: number;
  },
  copy: BackupEmailOtpCopy = defaultEmailCopy(AUTH_EMAIL_COPY.backup_email_otp),
): RenderedEmail {
  const minutes = p.expiresInMinutes ?? 10;
  const t = filled(copy, { minutes });
  const text = `${t.intro} ${p.code}
${t.expiry}

${t.closing}`;

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    audience: "partner",
    bodyHtml: `${paragraph(t.intro)}
${codeBlock(p.code, { caption: t.expiry })}
${paragraph(t.closing, { muted: true })}`,
  });

  return { subject: t.subject, text, html };
}

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
