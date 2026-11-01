import type { User } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/auth/admin";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import {
  consentToRecord,
  destinationAfterSignIn,
  signInErrorPath,
  signUpNotice,
  type SignInIntent,
  type SignUpConsent,
  type SignUpNotice,
} from "@/lib/auth/sign-in-intent";
import { setMarketingEmail } from "@/lib/marketing-consent/consent";
import { marketingEmailState, type MarketingEmailState } from "@/lib/marketing-consent/state";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

/**
 * The one place a sign-in finishes (PRD-campaign-audiences slice 03), however
 * it was proven: Google or a link through `/auth/callback`, the 6-digit code
 * (`finishSignIn`), or the scanner-safe link (`/auth/confirm`). Server only.
 *
 *  - **Staff** tab: an email on the team goes on to the Admin Panel. Anyone
 *    else is signed out again and sent back to the Staff tab with why. It
 *    never makes a Customer and never records consent.
 *  - **Partner Hub**: as before, straight to the destination.
 *  - **Customer** tab and footer: their Customer is found or made now
 *    (`linkCustomerToAuthUser`, which also runs the Claim and adopts their
 *    guest orders), so the CRM and the campaign Audiences see them at once,
 *    in the language they signed up in. Then the consent they gave is
 *    recorded under its source, only now that the address is proven, and
 *    only for someone nobody has asked (`set_marketing_email`).
 *
 * A failure after the session exists (the Customer, the consent) is logged
 * and never stops the sign-in.
 */

export type SignInOutcome =
  | { ok: true; destination: string; notice: SignUpNotice | null }
  | { ok: false; destination: string };

export interface CompleteSignInDeps {
  isStaff: () => Promise<boolean>;
  signOut: () => Promise<void>;
  linkCustomer: (user: User, locale: SignInIntent["locale"]) => Promise<{ id: string; marketing_email?: unknown }>;
  subscribe: (customerId: string, source: SignUpConsent) => Promise<{ ok: boolean; changed?: boolean; error?: string }>;
}

const defaultDeps: CompleteSignInDeps = {
  isStaff: async () => Boolean(await getAdminContext()),
  signOut: async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  },
  linkCustomer: (user, locale) => linkCustomerToAuthUser(user, { locale }),
  subscribe: (customerId, source) => setMarketingEmail(supabaseAdmin(), { customerId, to: "subscribed", source }),
};

export async function completeSignIn(
  user: User,
  intent: SignInIntent,
  deps: Partial<CompleteSignInDeps> = {},
): Promise<SignInOutcome> {
  const d = { ...defaultDeps, ...deps };
  const isStaff = await d.isStaff().catch(() => false);

  if (intent.audience === "staff") {
    if (!isStaff) {
      await d.signOut().catch((e) => console.error("[sign-in] staff sign-out failed:", errorText(e)));
      return { ok: false, destination: signInErrorPath(intent, "not_staff") };
    }
    return { ok: true, destination: destinationAfterSignIn(intent), notice: null };
  }

  if (intent.audience === "partner") {
    return { ok: true, destination: destinationAfterSignIn(intent), notice: null };
  }

  let notice: SignUpNotice | null = null;
  try {
    const customer = await d.linkCustomer(user, intent.locale);
    const consent = consentToRecord(intent, isStaff);
    if (consent) {
      const before: MarketingEmailState = marketingEmailState(customer.marketing_email);
      const res = await d.subscribe(customer.id, consent);
      if (!res.ok) console.error(`[sign-in] ${consent} consent not recorded:`, res.error);
      notice = signUpNotice({ consent, before, changed: res.ok && res.changed === true });
    }
  } catch (e) {
    console.error("[sign-in] customer not linked:", errorText(e));
  }
  return { ok: true, destination: destinationAfterSignIn(intent), notice };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
