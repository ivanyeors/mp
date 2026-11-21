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

export const CLAIM_BONUS_EMAIL = "account.claim_bonus";

export interface ClaimOutcome {
  claimed: boolean;
  bonusGranted: boolean;
  bonusEmailDue: boolean;
}

const NOTHING: ClaimOutcome = { claimed: false, bonusGranted: false, bonusEmailDue: false };

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

function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

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
