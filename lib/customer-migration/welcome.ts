/**
 * The welcome page's state (PRD-shopify-customer-migration slice 06):
 * `/[lang]/account/welcome?c=<token>`, where a campaign email lands.
 *
 * Pure: the page resolves the session and the Claim link, then this decides
 * what to show. Five situations, three screens:
 *
 *   signed out, token valid                   → signed_out, greeted by name, email prefilled
 *   signed out, no token                      → signed_out, no name, empty form
 *   signed out, token unknown, malformed, or
 *     for a deleted Customer                  → exactly the same as no token
 *   signed in, as the token's Customer or
 *     with no (valid) token                   → signed_in: the voucher and the account
 *   signed in, as another Customer            → wrong_account: the switch link, no name
 *
 * An invalid token yields the same state as no token, field for field, so the
 * page never says whether a token was valid. None of these signs anyone in:
 * a signed-out visitor still completes Google or the emailed code.
 */
import type { ClaimLinkCustomer } from "@/lib/customer-migration/claim-link";

export type WelcomeState =
  | {
      kind: "signed_out";
      /** The token's Customer's first name; null without a valid token. */
      firstName: string | null;
      /** Prefilled into the sign-in form; empty without a valid token. */
      prefillEmail: string;
      /** The token the sign-in form returns to; null without a valid token. */
      returnToken: string | null;
    }
  | { kind: "signed_in" }
  | {
      kind: "wrong_account";
      /** The visitor's own login, never the token's Customer's. */
      signedInEmail: string;
      /** *Use another account* signs out and returns here, to the prefilled form. */
      returnToken: string;
    };

export interface WelcomeInput {
  /** The signed-in visitor's own Customer, after `linkCustomerToAuthUser`; null when signed out. */
  session: { customerId: string; email: string } | null;
  /** The `c` parameter as given. */
  token: string | null;
  /** Whose Claim link `token` is, or null when it is no one's. */
  tokenCustomer: ClaimLinkCustomer | null;
}

export function selectWelcomeState({ session, token, tokenCustomer }: WelcomeInput): WelcomeState {
  // An unresolved token is treated as no token at all.
  const valid = tokenCustomer && token ? { token, customer: tokenCustomer } : null;

  if (!session) {
    return valid
      ? {
          kind: "signed_out",
          firstName: valid.customer.firstName?.trim() || null,
          prefillEmail: valid.customer.email,
          returnToken: valid.token,
        }
      : { kind: "signed_out", firstName: null, prefillEmail: "", returnToken: null };
  }

  if (valid && valid.customer.customerId !== session.customerId) {
    return { kind: "wrong_account", signedInEmail: session.email, returnToken: valid.token };
  }
  return { kind: "signed_in" };
}
