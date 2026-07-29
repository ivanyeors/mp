/**
 * Partner transactional emails (#84). Mirrors lib/email/index.ts + rma.ts: an
 * idempotent DB-backed dispatch keyed on the `partner_emails` ledger, plus one
 * branded template per partner event. Every hook is best-effort — a partner
 * email must NEVER break capture / payment / approval / payout.
 *
 * Idempotency key: (partner_id, template, entity_id). entity_id already encodes
 * the entity (order id, `${partnerId}:tierN`, payout id, `${partnerId}:${ver}`,
 * partner_users id), so referral-earned fires exactly once per attributed order
 * and never on void/decrement (the void path never re-enters commission create).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailTransport } from ".";
import { escapeHtml, renderEmailShell } from "./base";
import { formatMoney } from "./templates";
import { getDefaultFromAddress } from "./transport";
import { getSiteOrigin } from "@/lib/site-url";
import type { RenderedEmail, SendOutcome } from "./types";

const HUB_URL = () => `${getSiteOrigin()}/partner`;

// ------------------------------------------------------------
// Idempotent dispatch (DB-backed, keyed on partner_emails)
// ------------------------------------------------------------

/**
 * Send a partner email at most once per (partner_id, template, entity_id). Claims
 * a `partner_emails` row (ignoreDuplicates → [] on conflict ⇒ skip) before sending.
 * NEVER throws — logs on failure and marks the row so an operator can see it.
 * `partnerId` may be null (a rejected application has no partner row).
 */
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

/**
 * The partner's contact email: their partner_users login email (approved row
 * preferred), falling back to the verified backup email. Null when unresolvable —
 * callers treat that as "nothing to send".
 */
export async function partnerRecipientEmail(
  admin: SupabaseClient,
  partnerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("partner_users")
    .select("email, backup_email, application_status")
    .eq("partner_id", partnerId)
    .order("application_status", { ascending: true }) // 'approved' sorts before 'pending'/'rejected'
    .limit(1);
  const row = (data ?? [])[0] as { email?: string; backup_email?: string } | undefined;
  return row?.email ?? row?.backup_email ?? null;
}

// ------------------------------------------------------------
// Templates (pure — importable by #85 tests / the self-check)
// ------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Human date in Singapore time (business is SG), from a timestamptz ISO string. */
export function formatSgDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000); // shift to SGT, then read UTC parts
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The DATED release line — never an undated amount (AC). Both branches state timing. */
function releaseLine(releaseAtIso: string | null): string {
  return releaseAtIso
    ? `This commission releases on ${formatSgDate(releaseAtIso)} (30 days after delivery).`
    : `This commission releases 30 days after your customer's order is delivered.`;
}

/** Referral-earned copy. `money` is pre-formatted; `releaseAtIso` null ⇒ undelivered. */
export function renderReferralEarnedEmail(p: { money: string; releaseAtIso: string | null }): RenderedEmail {
  const line = releaseLine(p.releaseAtIso);
  const subject = `You earned ${p.money} in commission`;
  const text = `Good news — you've earned ${p.money} in commission from a referred order.

${line}

Track it in your Partner Hub: ${HUB_URL()}

— The Mpillow team`;
  const html = renderEmailShell({
    title: "You earned a commission",
    bodyHtml: `<p style="color:#444;">Good news — you've earned <strong>${escapeHtml(p.money)}</strong> in commission from a referred order.</p>
    <p style="color:#444;">${escapeHtml(line)}</p>
    <p><a href="${HUB_URL()}" style="color:#2563eb;">Track it in your Partner Hub</a></p>
    <p style="color:#444;margin-top:16px;">— The Mpillow team</p>`,
  });
  return { subject, text, html };
}

export function renderMilestoneEmail(p: {
  tier: number;
  bonus: string | null;
  perk: string | null;
}): RenderedEmail {
  const parts = [`Congratulations — you've reached tier ${p.tier} in the Mpillow Partner programme.`];
  if (p.bonus) parts.push(`You've earned a one-time bonus of ${p.bonus}.`);
  if (p.perk) parts.push(`Your new perk: ${p.perk}.`);
  const subject = "You reached a new partner milestone";
  const text = `${parts.join("\n\n")}

Open your Partner Hub: ${HUB_URL()}

— The Mpillow team`;
  const html = renderEmailShell({
    title: "New milestone reached",
    bodyHtml: `${parts.map((s) => `<p style="color:#444;">${escapeHtml(s)}</p>`).join("\n    ")}
    <p><a href="${HUB_URL()}" style="color:#2563eb;">Open your Partner Hub</a></p>
    <p style="color:#444;margin-top:16px;">— The Mpillow team</p>`,
  });
  return { subject, text, html };
}

/** Payout copy. `proofUrl` (a long-lived signed URL) links the proof of payment (AC5). */
export function renderPayoutEmail(p: {
  money: string;
  paidOn: string;
  proofUrl: string | null;
}): RenderedEmail {
  const subject = `Your payout of ${p.money} has been sent`;
  const proofText = p.proofUrl ? `\n\nView your proof of payment: ${p.proofUrl}` : "";
  const text = `We've sent your partner payout of ${p.money} on ${p.paidOn}.${proofText}

— The Mpillow team`;
  const proofHtml = p.proofUrl
    ? `<p><a href="${escapeHtml(p.proofUrl)}" style="color:#2563eb;">View your proof of payment</a></p>`
    : "";
  const html = renderEmailShell({
    title: "Payout sent",
    bodyHtml: `<p style="color:#444;">We've sent your partner payout of <strong>${escapeHtml(p.money)}</strong> on ${escapeHtml(p.paidOn)}.</p>
    ${proofHtml}
    <p style="color:#444;margin-top:16px;">— The Mpillow team</p>`,
  });
  return { subject, text, html };
}

export function renderReacceptEmail(p: { agreementVersion: string }): RenderedEmail {
  const subject = "You've re-accepted the Mpillow Partner Agreement";
  const text = `Thanks — we've recorded your acceptance of the updated Mpillow Partner Agreement (version ${p.agreementVersion}).

— The Mpillow team`;
  const html = renderEmailShell({
    title: "Agreement re-accepted",
    bodyHtml: `<p style="color:#444;">Thanks — we've recorded your acceptance of the updated Mpillow Partner Agreement (version <strong>${escapeHtml(p.agreementVersion)}</strong>).</p>
    <p style="color:#444;margin-top:16px;">— The Mpillow team</p>`,
  });
  return { subject, text, html };
}

// ------------------------------------------------------------
// Senders (gather data → dispatch idempotently, best-effort)
// ------------------------------------------------------------

/**
 * Referral-earned email — ATTRIBUTED CAPTURE only. Reads the commission rows just
 * created for this order to get the exact earned amount + dated release; sends
 * nothing when no commissionable line resolved (no earning) or the partner has no
 * email. Idempotent on entity_id = orderId, so it never double-sends and never
 * fires on a later void/decrement.
 */
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

  const rendered = renderReferralEarnedEmail({
    money: formatMoney(amount, input.currency),
    releaseAtIso,
  });
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "referral_earned",
    entityId: input.orderId,
    to,
    ...rendered,
  });
}

/** Milestone rung-reached email. Idempotent on entity_id = `${partnerId}:tier${tier}`. */
export async function sendMilestoneReachedEmail(
  admin: SupabaseClient,
  input: { partnerId: string; tier: number; cashBonus: number; perkLabel: string },
): Promise<void> {
  const to = await partnerRecipientEmail(admin, input.partnerId);
  if (!to) return;
  const rendered = renderMilestoneEmail({
    tier: input.tier,
    bonus: input.cashBonus > 0 ? formatMoney(input.cashBonus, "SGD") : null,
    perk: input.perkLabel.trim() || null,
  });
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "milestone_reached",
    entityId: `${input.partnerId}:tier${input.tier}`,
    to,
    ...rendered,
  });
}

/** Payout-made email. Idempotent on entity_id = payoutId. `proofUrl` is pre-signed. */
export async function sendPayoutMadeEmail(
  admin: SupabaseClient,
  input: { partnerId: string; payoutId: string; amount: number; paidOn: string; proofUrl: string | null },
): Promise<void> {
  const to = await partnerRecipientEmail(admin, input.partnerId);
  if (!to) return;
  const rendered = renderPayoutEmail({
    money: formatMoney(input.amount, "SGD"),
    paidOn: input.paidOn,
    proofUrl: input.proofUrl,
  });
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "payout_made",
    entityId: input.payoutId,
    to,
    ...rendered,
  });
}

/** Re-accept-terms email. Idempotent on entity_id = `${partnerId}:${agreementVersion}`. */
export async function sendReacceptEmail(
  admin: SupabaseClient,
  input: { partnerId: string; agreementVersion: string; to: string },
): Promise<void> {
  if (!input.to) return;
  const rendered = renderReacceptEmail({ agreementVersion: input.agreementVersion });
  await dispatchPartnerEmail(admin, {
    partnerId: input.partnerId,
    template: "reaccept_terms",
    entityId: `${input.partnerId}:${input.agreementVersion}`,
    to: input.to,
    ...rendered,
  });
}
