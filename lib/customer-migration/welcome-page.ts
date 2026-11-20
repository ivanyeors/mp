import type { User } from "@supabase/supabase-js";
import type { ClaimLinkCustomer } from "@/lib/customer-migration/claim-link";
import { selectWelcomeState, type WelcomeState } from "@/lib/customer-migration/welcome";
import type { ClaimBonusView } from "@/lib/points/claim-bonus";
import type { Customer } from "@/lib/types/ecommerce";

export interface WelcomeDeps {
  getUser(): Promise<User | null>;
  linkCustomer(user: User): Promise<Pick<Customer, "id" | "email" | "first_name">>;
  openLink(token: string | null, options: { count: boolean }): Promise<ClaimLinkCustomer | null>;
  readBonus(customerId: string): Promise<ClaimBonusView | null>;
  hasAddress(customerId: string): Promise<boolean>;
}

export interface WelcomeAccount {
  firstName: string | null;
  email: string;
  hasAddress: boolean;
  bonus: ClaimBonusView | null;
}

export interface WelcomePageData {
  state: WelcomeState;
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

  const [bonus, hasAddress] = await Promise.all([
    deps.readBonus(customer.id).catch(() => null),
    deps.hasAddress(customer.id).catch(() => false),
  ]);
  return {
    state,
    account: {
      firstName: customer.first_name?.trim() || null,
      email,
      hasAddress,
      bonus,
    },
  };
}
