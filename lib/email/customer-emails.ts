// ============================================================
// customer_emails — the per-Customer send ledger
// ============================================================
//
// `order_emails` keys a send by Order (dispatchOrderEmail in ./index). These
// emails belong to a Customer instead, and are keyed by
// (customer, template, entity): the Claim bonus email (PRD-loyalty-points
// slice 05) uses the Customer itself as the entity, the CRM's Aftercare emails
// use the Customer or an Order.
//
// The row is claimed as `pending` before sending, then marked `sent` or
// `failed`. Unlike order_emails, a failed send is retried: a later claim
// re-claims a `failed` row while it has attempts left
// (claim_customer_email, 20261020112000_customer_emails.sql). Nothing here
// throws: email must never break the request that triggered it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from "./index";
import { getDefaultFromAddress } from "./transport";
import type { EmailTransport, RenderedEmail, SendOutcome } from "./types";

/** Matches `attempts < 3` in claim_customer_email. */
export const CUSTOMER_EMAIL_MAX_ATTEMPTS = 3;

export interface CustomerEmailKey {
  customerId: string;
  /** The registry id (lib/email/registry.ts), e.g. "account.claim_bonus". */
  template: string;
  /** What the email is about: the Customer, an Order… */
  entityId: string;
}

export type CustomerEmailClaim =
  | { claimed: true; id: number; attempts: number }
  /** Already sent, in flight, out of attempts, or the claim itself failed. */
  | { claimed: false; error?: string };

/**
 * Claims one send. `claimed: true` means this caller owns it and must mark it
 * sent or failed. One SQL statement, so two concurrent callers cannot both win.
 */
export async function claimCustomerEmail(
  admin: SupabaseClient,
  key: CustomerEmailKey,
): Promise<CustomerEmailClaim> {
  const { data, error } = await admin.rpc("claim_customer_email", {
    p_customer_id: key.customerId,
    p_template: key.template,
    p_entity_id: key.entityId,
  });
  if (error) return { claimed: false, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: number | string; attempts: number }
    | null
    | undefined;
  if (!row) return { claimed: false };
  return { claimed: true, id: Number(row.id), attempts: row.attempts };
}

export async function markCustomerEmailSent(admin: SupabaseClient, id: number): Promise<void> {
  const { error } = await admin
    .from("customer_emails")
    .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
    .eq("id", id);
  if (error) console.error(`[customer-emails] could not mark ${id} sent:`, error.message);
}

/**
 * Records a failed attempt. Returns whether a later claim may try again: the
 * attempt count was set when this attempt was claimed.
 */
export async function markCustomerEmailFailed(
  admin: SupabaseClient,
  claim: { id: number; attempts: number },
  message: string,
): Promise<{ retryable: boolean }> {
  const { error } = await admin
    .from("customer_emails")
    .update({ status: "failed", last_error: message.slice(0, 1000) })
    .eq("id", claim.id);
  if (error) console.error(`[customer-emails] could not mark ${claim.id} failed:`, error.message);
  return { retryable: claim.attempts < CUSTOMER_EMAIL_MAX_ATTEMPTS };
}

/**
 * Claim → send → mark. Renders only once the send is claimed, so a skipped
 * send costs no render, and work that must happen only for the caller that
 * owns the send can go in `render` (the review request mints its link token
 * there). A `render` that throws is a failed attempt, like a failed send.
 * Returns `skipped` when it was not this caller's to send.
 */
export async function dispatchCustomerEmail(params: {
  key: CustomerEmailKey;
  to: string;
  render: () => RenderedEmail | Promise<RenderedEmail>;
  /** Reply-To, e.g. the support inbox for an email whose footer says "reply to this email". */
  replyTo?: string;
  admin?: SupabaseClient;
  transport?: EmailTransport;
}): Promise<SendOutcome> {
  const admin = params.admin ?? supabaseAdmin();
  const { key } = params;
  const label = `${key.template} for customer ${key.customerId}`;

  const claim = await claimCustomerEmail(admin, key);
  if (!claim.claimed) {
    if (claim.error) {
      console.error(`[customer-emails] could not claim ${label}:`, claim.error);
      return { sent: false, error: claim.error };
    }
    return { sent: false, skipped: true };
  }

  try {
    const transport = params.transport ?? getEmailTransport();
    const result = await transport.send({
      ...(await params.render()),
      to: params.to,
      from: getDefaultFromAddress(),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    await markCustomerEmailSent(admin, claim.id);
    return { sent: true, transport: transport.name, id: result.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { retryable } = await markCustomerEmailFailed(admin, claim, message);
    console.error(
      `[customer-emails] ${label} failed (attempt ${claim.attempts}${retryable ? ", will retry" : ", giving up"}):`,
      message,
    );
    return { sent: false, error: message };
  }
}
