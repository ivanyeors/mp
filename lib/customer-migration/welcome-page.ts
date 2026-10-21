/**
 * What the welcome page loads (PRD-shopify-customer-migration slice 06), with
 * its reads passed in so the order is testable without a session.
 *
 * Signed out: open the Claim link (records the click) and pick the state.
 * Signed in: `linkCustomerToAuthUser` first. It binds the login and runs the
 * Claim, awaiting it, so a voucher the Claim issues exists before the voucher
 * is read below: the first sign-in through this page shows the voucher on that
 * same page load. Nothing here signs anyone in or touches `auth.users`.
 */
import type { User } from "@supabase/supabase-js";
import type { ClaimLinkCustomer } from "@/lib/customer-migration/claim-link";
import { selectWelcomeState, type WelcomeState } from "@/lib/customer-migration/welcome";
import {
  usableWelcomeVoucherCard,
  type WelcomeVoucherCardData,
  type WelcomeVoucherRow,
} from "@/lib/customer-migration/welcome-voucher";
import type { Customer } from "@/lib/types/ecommerce";

export interface WelcomeDeps {
  getUser(): Promise<User | null>;
  /** `linkCustomerToAuthUser`: binds, and runs the Claim. */
  linkCustomer(user: User): Promise<Pick<Customer, "id" | "email" | "first_name">>;
  /** `openClaimLink`; `count: false` for a signed-in visit. */
  openLink(token: string | null, options: { count: boolean }): Promise<ClaimLinkCustomer | null>;
  readVoucher(customerId: string): Promise<WelcomeVoucherRow | null>;
  hasAddress(customerId: string): Promise<boolean>;
  now?(): Date;
}

export interface WelcomeAccount {
  firstName: string | null;
  email: string;
  /** At least one saved address, such as the one the import brought. */
  hasAddress: boolean;
  /** The voucher card, while the voucher is unused and unexpired. */
  voucher: WelcomeVoucherCardData | null;
}

export interface WelcomePageData {
  state: WelcomeState;
  /** Set only for `signed_in`. */
  account: WelcomeAccount | null;
}

export async function loadWelcomePage(
  { token }: { token: string | null },
  deps: WelcomeDeps,
): Promise<WelcomePageData> {
  const user = await deps.getUser();

  if (!user) {
    const tokenCustomer = token ? await deps.openLink(token, { count: true }) : null;
    return { state: selectWelcomeState({ session: null, token, tokenCustomer }), account: null };
  }

  const [customer, tokenCustomer] = await Promise.all([
    deps.linkCustomer(user),
    token ? deps.openLink(token, { count: false }) : Promise.resolve(null),
  ]);
  const email = customer.email || user.email || "";
  const state = selectWelcomeState({
    session: { customerId: customer.id, email: user.email || email },
    token,
    tokenCustomer,
  });
  if (state.kind !== "signed_in") return { state, account: null };

  // After the link: the Claim it ran has issued the voucher, if it was due.
  const [voucher, hasAddress] = await Promise.all([
    deps.readVoucher(customer.id),
    deps.hasAddress(customer.id).catch(() => false),
  ]);
  return {
    state,
    account: {
      firstName: customer.first_name?.trim() || null,
      email,
      hasAddress,
      voucher: usableWelcomeVoucherCard(voucher, deps.now?.() ?? new Date()),
    },
  };
}
