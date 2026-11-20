import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from "./index";
import { getDefaultFromAddress } from "./transport";
import type { EmailTransport, RenderedEmail, SendOutcome } from "./types";

export const CUSTOMER_EMAIL_MAX_ATTEMPTS = 3;

export interface CustomerEmailKey {
  customerId: string;
  template: string;
  entityId: string;
}

export type CustomerEmailClaim =
  | { claimed: true; id: number; attempts: number }
  | { claimed: false; error?: string };

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

export async function dispatchCustomerEmail(params: {
  key: CustomerEmailKey;
  to: string;
  render: () => RenderedEmail | Promise<RenderedEmail>;
  replyTo?: string;
  headers?: Record<string, string>;
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
      ...(params.headers ? { headers: params.headers } : {}),
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
