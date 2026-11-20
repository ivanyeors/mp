import type { ClaimLinkCustomer } from "@/lib/customer-migration/claim-link";

export type WelcomeState =
  | {
      kind: "signed_out";
      firstName: string | null;
      prefillEmail: string;
      returnToken: string | null;
    }
  | { kind: "signed_in" }
  | {
      kind: "wrong_account";
      signedInEmail: string;
      returnToken: string;
    };

export interface WelcomeInput {
  session: { customerId: string; email: string } | null;
  token: string | null;
  tokenCustomer: ClaimLinkCustomer | null;
}

export function selectWelcomeState({ session, token, tokenCustomer }: WelcomeInput): WelcomeState {
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
