/**
 * The Claim (ADR 0029 f; PRD-shopify-customer-migration slice 05).
 *
 * A Migrated customer's first sign-in after import. `linkCustomerToAuthUser`
 * binds the login as it would for any Customer, then calls `claimOnSignIn`,
 * for every decision type. That covers someone who signed in before this
 * shipped, and a Customer who already had an account when their Shopify row
 * merged into it: either claims on their next sign-in.
 *
 * `claim_migrated_customer` (20261020112100) does the Claim in one transaction:
 * it stamps `claimed_at` once and, at that moment only, issues the
 * Welcome-back voucher if the `site_settings` terms allow it. For everyone
 * else it is one indexed update that matches nothing. Nothing here binds a
 * login or touches `auth.users`; `linkCustomerToAuthUser` is the only binding
 * path.
 *
 * The welcome_voucher email is transactional (it confirms what the customer
 * just did), so it is sent whatever their Marketing consent, once, through the
 * `customer_emails` ledger. It goes after the response, so the first sign-in
 * does not wait on the mail server, and a failed send is retried by a later
 * sign-in while it has attempts left.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderWelcomeVoucherEmail, type WelcomeVoucherEmailData } from "@/lib/email/account";
import { dispatchCustomerEmail } from "@/lib/email/customer-emails";
import { formatSgDate } from "@/lib/email/format";
import type { EmailTransport, SendOutcome } from "@/lib/email/types";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Coupon, Customer } from "@/lib/types/ecommerce";

/**
 * The registry id of the welcome_voucher email, and its `customer_emails`
 * template. claim_migrated_customer names the same string.
 */
export const WELCOME_VOUCHER_EMAIL = "account.welcome_voucher";

export interface ClaimOutcome {
  /** This call stamped `claimed_at`. */
  claimed: boolean;
  /** This call issued the Welcome-back voucher. */
  voucherIssued: boolean;
  /** A usable voucher whose email is unsent, not in flight, with attempts left. */
  welcomeEmailDue: boolean;
}

const NOTHING: ClaimOutcome = { claimed: false, voucherIssued: false, welcomeEmailDue: false };

/** Pure — the RPC's one row, or nothing when it returned none. */
export function readClaimRow(data: unknown): ClaimOutcome {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { claimed?: unknown; voucher_issued?: unknown; welcome_email_due?: unknown }
    | null
    | undefined;
  if (!row) return NOTHING;
  return {
    claimed: row.claimed === true,
    voucherIssued: row.voucher_issued === true,
    welcomeEmailDue: row.welcome_email_due === true,
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

type WelcomeVoucher = Pick<
  Coupon,
  "code" | "discount_type" | "discount_value" | "currency" | "min_order_amount" | "expires_at"
>;

type ClaimingCustomer = Pick<Customer, "id" | "email" | "first_name" | "locale">;

/** Pure — the email's data from the Customer and their voucher row. */
export function welcomeVoucherEmailData(
  customer: ClaimingCustomer,
  voucher: WelcomeVoucher,
  origin: string = getSiteOrigin(),
): WelcomeVoucherEmailData {
  // The SQL always sets one; a voucher without an expiry is not this email's.
  if (!voucher.expires_at) throw new Error("welcome-back voucher has no expiry");
  const locale = isSupportedLocale(customer.locale) ? customer.locale : DEFAULT_LOCALE;
  const min = voucher.min_order_amount == null ? null : Number(voucher.min_order_amount);
  return {
    firstName: customer.first_name?.trim() || null,
    email: customer.email,
    code: voucher.code,
    discountType: voucher.discount_type,
    value: Number(voucher.discount_value),
    currency: voucher.currency,
    minOrderAmount: min && min > 0 ? min : null,
    expiresOn: formatSgDate(voucher.expires_at),
    shopUrl: `${origin}${withLocale("/shop", locale)}`,
  };
}

/**
 * Sends the welcome_voucher email for this Customer's voucher, at most once
 * (customer_emails, entity = the Customer). Never throws.
 */
export async function sendWelcomeVoucherEmail(
  customer: ClaimingCustomer,
  options: { admin?: SupabaseClient; transport?: EmailTransport } = {},
): Promise<SendOutcome> {
  const admin = options.admin ?? supabaseAdmin();
  try {
    const { data, error } = await admin
      .from("coupons")
      .select("code, discount_type, discount_value, currency, min_order_amount, expires_at")
      .eq("customer_id", customer.id)
      .eq("issued_for", "welcome_back")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { sent: false, skipped: true };
    const voucher = data as WelcomeVoucher;

    return await dispatchCustomerEmail({
      admin,
      transport: options.transport,
      key: { customerId: customer.id, template: WELCOME_VOUCHER_EMAIL, entityId: customer.id },
      to: customer.email,
      render: () => renderWelcomeVoucherEmail(welcomeVoucherEmailData(customer, voucher)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[claim] welcome_voucher email for ${customer.id} failed:`, message);
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
 * signed-in user owns. Awaits the Claim itself, so a voucher it issues is on
 * this same page load, and defers only the email.
 */
export async function claimOnSignIn(
  customer: ClaimingCustomer,
  options: { admin?: SupabaseClient; defer?: (task: () => Promise<unknown>) => void } = {},
): Promise<ClaimOutcome> {
  const admin = options.admin ?? supabaseAdmin();
  const outcome = await claimMigratedCustomer(customer.id, admin);
  if (outcome.welcomeEmailDue) {
    (options.defer ?? afterResponse)(() => sendWelcomeVoucherEmail(customer, { admin }));
  }
  return outcome;
}
