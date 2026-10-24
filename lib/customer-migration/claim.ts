/**
 * The Claim (ADR 0029 f; PRD-shopify-customer-migration slice 05), with the
 * Claim bonus that replaced the Welcome-back voucher (ADR 0030 f, g;
 * PRD-loyalty-points slice 05).
 *
 * A Migrated customer's first sign-in after import. `linkCustomerToAuthUser`
 * binds the login as it would for any Customer, then calls `claimOnSignIn`,
 * for every decision type. That covers someone who signed in before this
 * shipped, and a Customer who already had an account when their Shopify row
 * merged into it: either claims on their next sign-in.
 *
 * `claim_migrated_customer` (20261021150000) does it in one transaction: it
 * stamps `claimed_at` once, then grants the Claim bonus if points are on, the
 * Claim fell inside the customer's window, and they are not a partner. The
 * grant does not depend on this sign-in being the Claim, so someone who
 * claimed while points were off is granted at their next sign-in. For
 * everyone else it is one indexed update that matches nothing and one index
 * probe. Nothing here binds a login or touches `auth.users`.
 *
 * The claim_bonus email is transactional (it confirms what the customer's own
 * sign-in just added), so it is sent whatever their Marketing consent, once,
 * through the `customer_emails` ledger. It goes after the response, so the
 * sign-in does not wait on the mail server, and a failed send is retried by a
 * later sign-in while it has attempts left. (Counsel may call it commercial,
 * PRD-loyalty-points slice 08; then gate it on Marketing consent here.)
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAIM_BONUS_EMAIL_COPY, renderClaimBonusEmail } from "@/lib/email/account";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { dispatchCustomerEmail } from "@/lib/email/customer-emails";
import type { EmailTransport, SendOutcome } from "@/lib/email/types";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/ecommerce";

/**
 * The registry id of the claim_bonus email, and its `customer_emails`
 * template. claim_migrated_customer names the same string.
 */
export const CLAIM_BONUS_EMAIL = "account.claim_bonus";

export interface ClaimOutcome {
  /** This call stamped `claimed_at`. */
  claimed: boolean;
  /** This call granted the Claim bonus. */
  bonusGranted: boolean;
  /** A Claim bonus whose email is unsent, not in flight, with attempts left. */
  bonusEmailDue: boolean;
}

const NOTHING: ClaimOutcome = { claimed: false, bonusGranted: false, bonusEmailDue: false };

/** Pure — the RPC's one row, or nothing when it returned none. */
export function readClaimRow(data: unknown): ClaimOutcome {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { claimed?: unknown; bonus_granted?: unknown; bonus_email_due?: unknown }
    | null
    | undefined;
  if (!row) return NOTHING;
  return {
    claimed: row.claimed === true,
    bonusGranted: row.bonus_granted === true,
    bonusEmailDue: row.bonus_email_due === true,
  };
}

/**
 * Runs the Claim for one Customer. Never throws: a failed Claim must not break
 * sign-in, and changes nothing, so the next sign-in simply claims again.
 */
export async function claimMigratedCustomer(
  customerId: string,
  admin: SupabaseClient = supabaseAdmin(),
): Promise<ClaimOutcome> {
  try {
    const { data, error } = await admin.rpc("claim_migrated_customer", {
      p_customer_id: customerId,
    });
    if (error) {
      console.error(`[claim] claim_migrated_customer failed for ${customerId}:`, error.message);
      return NOTHING;
    }
    return readClaimRow(data);
  } catch (err) {
    console.error(`[claim] claim_migrated_customer threw for ${customerId}:`, err);
    return NOTHING;
  }
}

type ClaimingCustomer = Pick<Customer, "id" | "email" | "first_name" | "locale">;

/**
 * Sends the claim_bonus email for this Customer's bonus, at most once
 * (customer_emails, entity = the Customer). Never throws.
 */
export async function sendClaimBonusEmail(
  customer: ClaimingCustomer,
  options: { admin?: SupabaseClient; transport?: EmailTransport; origin?: string } = {},
): Promise<SendOutcome> {
  const admin = options.admin ?? supabaseAdmin();
  try {
    const { data, error } = await admin
      .from("points_ledger")
      .select("points")
      .eq("customer_id", customer.id)
      .eq("kind", "claim_bonus")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { sent: false, skipped: true };
    const points = Number((data as { points: number }).points);
    const locale = isSupportedLocale(customer.locale) ? customer.locale : DEFAULT_LOCALE;
    const origin = options.origin ?? getSiteOrigin();
    const shopUrl = `${origin}${withLocale("/shop", locale)}`;
    const termsUrl = `${origin}${withLocale("/points", locale)}`;
    const copy = await loadEmailCopy(CLAIM_BONUS_EMAIL_COPY, { admin });

    return await dispatchCustomerEmail({
      admin,
      transport: options.transport,
      key: { customerId: customer.id, template: CLAIM_BONUS_EMAIL, entityId: customer.id },
      to: customer.email,
      render: () => renderClaimBonusEmail({ firstName: customer.first_name?.trim() || null, points, shopUrl, termsUrl }, copy),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[claim] claim_bonus email for ${customer.id} failed:`, message);
    return { sent: false, error: message };
  }
}

/** Runs after the response when there is one; outside a request, now. */
function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * The Claim as `linkCustomerToAuthUser` runs it, for a Customer row the
 * signed-in user owns. Awaits the Claim itself, so a bonus it grants is on
 * this same page load, and defers only the email.
 */
export async function claimOnSignIn(
  customer: ClaimingCustomer,
  options: { admin?: SupabaseClient; defer?: (task: () => Promise<unknown>) => void } = {},
): Promise<ClaimOutcome> {
  const admin = options.admin ?? supabaseAdmin();
  const outcome = await claimMigratedCustomer(customer.id, admin);
  if (outcome.bonusEmailDue) {
    (options.defer ?? afterResponse)(() => sendClaimBonusEmail(customer, { admin }));
  }
  return outcome;
}
