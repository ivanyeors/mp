import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyPartnerWhatsApp } from "@/lib/whatsapp/partner-notify";
import { getEmailTransport } from ".";
import { renderEmailShell } from "./base";
import { amountPanel, infoList, paragraph, statusPill } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type CopyField, type EmailCopy } from "./copy";
import { loadEmailCopy } from "./copy-store";
import { formatSgDate } from "./format";
import { formatMoney } from "./templates";
import { getDefaultFromAddress } from "./transport";
import { getSiteOrigin } from "@/lib/site-url";
import type { RenderedEmail, SendOutcome } from "./types";

const HUB_URL = () => `${getSiteOrigin()}/partner`;

export async function dispatchPartnerEmail(
  admin: SupabaseClient,
  params: {
    partnerId: string | null;
    template: string;
    entityId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<SendOutcome> {
  const { partnerId, template, entityId, to, subject, text, html } = params;

  const { data: claim, error: claimError } = await admin
    .from("partner_emails")
    .upsert(
      { partner_id: partnerId, template, entity_id: entityId, recipient: to, status: "pending" },
      { onConflict: "partner_id,template,entity_id", ignoreDuplicates: true },
    )
    .select("id");

  if (claimError) {
    console.error(
      `[email] Failed to claim ${template} for partner ${partnerId} (${entityId}):`,
      claimError.message,
    );
    return { sent: false, error: claimError.message };
  }
  if (!claim || claim.length === 0) return { sent: false, skipped: true };

  const claimId = claim[0].id as string;
  try {
    const transport = getEmailTransport();
    const result = await transport.send({ to, from: getDefaultFromAddress(), subject, text, html });
    await admin
      .from("partner_emails")
      .update({
        status: "sent",
        provider: transport.name,
        provider_message_id: result.id ?? null,
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    return { sent: true, transport: transport.name, id: result.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[email] Failed to send ${template} for partner ${partnerId} (${entityId}):`,
      message,
    );
    await admin.from("partner_emails").update({ status: "failed", error: message }).eq("id", claimId);
    return { sent: false, error: message };
  }
}

export async function partnerRecipientEmail(
  admin: SupabaseClient,
  partnerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("partner_users")
    .select("email, backup_email, application_status")
    .eq("partner_id", partnerId)
    .order("application_status", { ascending: true })
    .limit(1);
  const row = (data ?? [])[0] as { email?: string; backup_email?: string } | undefined;
  return row?.email ?? row?.backup_email ?? null;
}

export { formatSgDate };

const SIGNOFF: CopyField = { label: "Sign-off", default: "— The Mpillow team", optional: true };
const RELEASE_HINT = "Say when it releases: a commission email never states an amount without its timing.";

export const PARTNER_EMAIL_COPY = {
  referral_earned: defineEmailCopy({
    id: "partner.referral_earned",
    name: "Commission earned",
    description: "Sent to a partner when a customer they referred pays for an order, with the commission earned and when it releases.",
    placeholders: {
      amount: "The commission earned, e.g. SGD 48.00",
      release_date: "The day the commission releases, e.g. 4 September 2026",
    },
    fields: {
      subject: { label: "Subject", default: "You earned {amount} in commission" },
      preheader: { label: "Inbox preview line", default: "{amount} in commission from a referred order." },
      heading: { label: "Heading", default: "You earned a commission" },
      intro: { label: "Message", default: "Good news — you've earned commission from a referred order." },
      release_dated: {
        label: "Under the amount",
        default: "This commission releases on {release_date} (30 days after delivery).",
        hint: RELEASE_HINT,
        group: "Order delivered",
      },
      release_undated: {
        label: "Under the amount",
        default: "This commission releases 30 days after your customer's order is delivered.",
        hint: `${RELEASE_HINT} The order isn't delivered yet, so there is no date to name.`,
        group: "Order not yet delivered",
      },
      button: { label: "Button", default: "Track it in your Partner Hub" },
      signoff: SIGNOFF,
    },
  }),
  milestone_reached: defineEmailCopy({
    id: "partner.milestone_reached",
    name: "Milestone reached",
    description: "Sent to a partner when they reach a new tier of the Partner programme, with the bonus and perk it brings.",
    placeholders: { tier: "The tier reached, e.g. 2" },
    fields: {
      subject: { label: "Subject", default: "You reached a new partner milestone" },
      preheader: { label: "Inbox preview line", default: "You've reached tier {tier} in the Mpillow Partner programme." },
      heading: { label: "Heading", default: "New milestone reached" },
      intro: { label: "Message", default: "Congratulations — you've reached tier {tier} in the Mpillow Partner programme." },
      button: { label: "Button", default: "Open your Partner Hub" },
      signoff: SIGNOFF,
    },
  }),
  payout_made: defineEmailCopy({
    id: "partner.payout_made",
    name: "Payout sent",
    description: "Sent to a partner when Staff record a payout to them, with the amount and the proof of payment.",
    placeholders: {
      amount: "The amount paid out, e.g. SGD 240.00",
      paid_on: "The payment date Staff recorded, e.g. 2026-08-01",
    },
    fields: {
      subject: { label: "Subject", default: "Your payout of {amount} has been sent" },
      preheader: { label: "Inbox preview line", default: "Your partner payout of {amount} is on its way." },
      heading: { label: "Heading", default: "Payout sent" },
      intro: { label: "Message", default: "We've sent your partner payout." },
      button_proof: {
        label: "Button, with a proof of payment",
        default: "View your proof of payment",
        hint: "The button when Staff attached a proof of payment: it opens it.",
      },
      button_hub: {
        label: "Button, without a proof of payment",
        default: "Open your Partner Hub",
        hint: "The button when there is no proof of payment: it opens the Partner Hub instead.",
      },
      signoff: SIGNOFF,
    },
  }),
  reaccept_terms: defineEmailCopy({
    id: "partner.reaccept_terms",
    name: "Agreement re-accepted",
    description: "Sent to a partner when they accept an updated Partner Agreement, confirming the version they accepted.",
    placeholders: { agreement_version: "The version of the agreement accepted, e.g. 2026-07-28" },
    fields: {
      subject: { label: "Subject", default: "You've re-accepted the Mpillow Partner Agreement" },
      preheader: { label: "Inbox preview line", default: "We've recorded your acceptance of the updated Partner Agreement." },
      heading: { label: "Heading", default: "Agreement re-accepted" },
      intro: { label: "Message", default: "Thanks — we've recorded your acceptance of the updated Mpillow Partner Agreement." },
      button: { label: "Button", default: "Open your Partner Hub" },
      signoff: SIGNOFF,
    },
  }),
};

type CopyOf<T extends keyof typeof PARTNER_EMAIL_COPY> = EmailCopy<keyof (typeof PARTNER_EMAIL_COPY)[T]["fields"] & string>;

function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

const signoffText = (signoff: string) => (signoff ? ["", signoff] : []);

export function renderReferralEarnedEmail(
  p: { money: string; releaseAtIso: string | null },
  copy: CopyOf<"referral_earned"> = defaultEmailCopy(PARTNER_EMAIL_COPY.referral_earned),
): RenderedEmail {
  const t = filled(copy, {
    amount: p.money,
    release_date: p.releaseAtIso ? formatSgDate(p.releaseAtIso) : null,
  });
  const line = p.releaseAtIso ? t.release_dated : t.release_undated;
  const text = [
    t.intro,
    "",
    `Commission earned: ${p.money}`,
    line,
    "",
    `${t.button}: ${HUB_URL()}`,
    ...signoffText(t.signoff),
  ].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    audience: "partner",
    bodyHtml: `${paragraph(t.intro)}
${amountPanel({ label: "Commission earned", amount: p.money, caption: line })}
${t.signoff ? paragraph(t.signoff, { muted: true }) : ""}`,
    cta: { href: HUB_URL(), label: t.button },
  });
  return { subject: t.subject, text, html };
}

export function renderMilestoneEmail(
  p: {
    tier: number;
    bonus: string | null;
    perk: string | null;
  },
  copy: CopyOf<"milestone_reached"> = defaultEmailCopy(PARTNER_EMAIL_COPY.milestone_reached),
): RenderedEmail {
  const t = filled(copy, { tier: p.tier });
  const text = [
    t.intro,
    ...(p.bonus ? ["", `One-time bonus: ${p.bonus}`] : []),
    ...(p.perk ? ["", `New perk: ${p.perk}`] : []),
    "",
    `${t.button}: ${HUB_URL()}`,
    ...signoffText(t.signoff),
  ].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    audience: "partner",
    bodyHtml: `${statusPill(`Tier ${p.tier}`, "success")}
${paragraph(t.intro, { top: 16 })}
${p.bonus ? amountPanel({ label: "One-time bonus", amount: p.bonus }) : ""}
${p.perk ? infoList([{ label: "New perk", value: p.perk, strong: true }]) : ""}
${t.signoff ? paragraph(t.signoff, { muted: true }) : ""}`,
    cta: { href: HUB_URL(), label: t.button },
  });
  return { subject: t.subject, text, html };
}

export function renderPayoutEmail(
  p: {
    money: string;
    paidOn: string;
    proofUrl: string | null;
  },
  copy: CopyOf<"payout_made"> = defaultEmailCopy(PARTNER_EMAIL_COPY.payout_made),
): RenderedEmail {
  const t = filled(copy, { amount: p.money, paid_on: p.paidOn });
  const cta = p.proofUrl
    ? { href: p.proofUrl, label: t.button_proof, variant: "secondary" as const }
    : { href: HUB_URL(), label: t.button_hub };
  const text = [
    t.intro,
    "",
    `Payout sent: ${p.money}`,
    `Paid on ${p.paidOn}`,
    "",
    `${cta.label}: ${cta.href}`,
    ...signoffText(t.signoff),
  ].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    audience: "partner",
    bodyHtml: `${paragraph(t.intro)}
${amountPanel({ label: "Payout sent", amount: p.money, caption: `Paid on ${p.paidOn}` })}
${t.signoff ? paragraph(t.signoff, { muted: true }) : ""}`,
    cta,
  });
  return { subject: t.subject, text, html };
}

export function renderReacceptEmail(
  p: { agreementVersion: string },
  copy: CopyOf<"reaccept_terms"> = defaultEmailCopy(PARTNER_EMAIL_COPY.reaccept_terms),
): RenderedEmail {
  const t = filled(copy, { agreement_version: p.agreementVersion });
  const text = [
    t.intro,
    "",
    `Agreement version: ${p.agreementVersion}`,
    "",
    `${t.button}: ${HUB_URL()}`,
    ...signoffText(t.signoff),
  ].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    audience: "partner",
    bodyHtml: `${paragraph(t.intro)}
${infoList([{ label: "Agreement version", value: p.agreementVersion, strong: true }])}
${t.signoff ? paragraph(t.signoff, { muted: true }) : ""}`,
    cta: { href: HUB_URL(), label: t.button },
  });
  return { subject: t.subject, text, html };
}

export async function sendReferralEarnedEmail(
  admin: SupabaseClient,
  input: { partnerId: string; orderId: string; currency: string },
): Promise<void> {
  const to = await partnerRecipientEmail(admin, input.partnerId);
  if (!to) return;

  const { data } = await admin
    .from("commissions")
    .select("commission_amount, release_at")
    .eq("order_id", input.orderId)
    .eq("partner_id", input.partnerId)
    .neq("status", "void");
  const rows = (data ?? []) as Array<{ commission_amount: number | string; release_at: string | null }>;
  if (rows.length === 0) return;

  const amount = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
  if (amount <= 0) return;
  const releaseAtIso = rows.find((r) => r.release_at)?.release_at ?? null;

  const money = formatMoney(amount, input.currency);
  const copy = await loadEmailCopy(PARTNER_EMAIL_COPY.referral_earned);
  const rendered = renderReferralEarnedEmail({ money, releaseAtIso }, copy);
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "referral_earned",
    entityId: input.orderId,
    to,
    ...rendered,
  });
  await notifyPartnerWhatsApp(admin, {
    partnerId: input.partnerId,
    template: "referral_earned",
    entityId: input.orderId,
    bodyParams: [money],
  });
}

export async function sendMilestoneReachedEmail(
  admin: SupabaseClient,
  input: { partnerId: string; tier: number; cashBonus: number; perkLabel: string },
): Promise<void> {
  const to = await partnerRecipientEmail(admin, input.partnerId);
  if (!to) return;
  const copy = await loadEmailCopy(PARTNER_EMAIL_COPY.milestone_reached);
  const rendered = renderMilestoneEmail(
    {
      tier: input.tier,
      bonus: input.cashBonus > 0 ? formatMoney(input.cashBonus, "SGD") : null,
      perk: input.perkLabel.trim() || null,
    },
    copy,
  );
  const entityId = `${input.partnerId}:tier${input.tier}`;
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "milestone_reached",
    entityId,
    to,
    ...rendered,
  });
  await notifyPartnerWhatsApp(admin, {
    partnerId: input.partnerId,
    template: "milestone_reached",
    entityId,
    bodyParams: [String(input.tier)],
  });
}

export async function sendPayoutMadeEmail(
  admin: SupabaseClient,
  input: { partnerId: string; payoutId: string; amount: number; paidOn: string; proofUrl: string | null },
): Promise<void> {
  const to = await partnerRecipientEmail(admin, input.partnerId);
  if (!to) return;
  const copy = await loadEmailCopy(PARTNER_EMAIL_COPY.payout_made);
  const rendered = renderPayoutEmail(
    {
      money: formatMoney(input.amount, "SGD"),
      paidOn: input.paidOn,
      proofUrl: input.proofUrl,
    },
    copy,
  );
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "payout_made",
    entityId: input.payoutId,
    to,
    ...rendered,
  });
  await notifyPartnerWhatsApp(admin, {
    partnerId: input.partnerId,
    template: "payout_made",
    entityId: input.payoutId,
    bodyParams: [formatMoney(input.amount, "SGD"), input.paidOn],
  });
}

export async function sendReacceptEmail(
  admin: SupabaseClient,
  input: { partnerId: string; agreementVersion: string; to: string },
): Promise<void> {
  if (!input.to) return;
  const copy = await loadEmailCopy(PARTNER_EMAIL_COPY.reaccept_terms);
  const rendered = renderReacceptEmail({ agreementVersion: input.agreementVersion }, copy);
  const entityId = `${input.partnerId}:${input.agreementVersion}`;
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "reaccept_terms",
    entityId,
    to: input.to,
    ...rendered,
  });
  await notifyPartnerWhatsApp(admin, {
    partnerId: input.partnerId,
    template: "reaccept_terms",
    entityId,
    bodyParams: [input.agreementVersion],
  });
}
