import type { User } from "@supabase/supabase-js";
import { claimOnSignIn } from "@/lib/customer-migration/claim";
import { supabaseAdmin } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/supabase/like-pattern";
import type { Locale } from "@/lib/i18n/locales";
import type { Customer } from "@/lib/types/ecommerce";

export type CustomerLinkDecision =
  | { type: "already_linked" }
  | { type: "link_existing"; customerId: string }
  | { type: "create" };

export { escapeLikePattern };

export function decideCustomerLink(params: {
  authUserId: string;
  byAuthId: Pick<Customer, "id" | "auth_user_id"> | null;
  byEmail: Pick<Customer, "id" | "auth_user_id"> | null;
}): CustomerLinkDecision {
  const { authUserId, byAuthId, byEmail } = params;

  if (byAuthId) return { type: "already_linked" };

  if (byEmail) {
    if (byEmail.auth_user_id == null || byEmail.auth_user_id === authUserId) {
      return { type: "link_existing", customerId: byEmail.id };
    }
    return { type: "already_linked" };
  }

  return { type: "create" };
}

export async function linkCustomerToAuthUser(
  user: User,
  options: {
    locale?: Locale;
  } = {},
): Promise<Customer> {
  const email = (user.email ?? "").toLowerCase().trim();
  if (!email) {
    throw new Error("Cannot link a customer for an auth user without an email");
  }
  if (!user.email_confirmed_at) {
    throw new Error("Cannot link a customer for an auth user whose email is not confirmed");
  }

  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("customers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: byEmail } = await admin
    .from("customers")
    .select("*")
    .ilike("email", escapeLikePattern(email))
    .maybeSingle();

  const decision = decideCustomerLink({
    authUserId: user.id,
    byAuthId: byAuthId as Customer | null,
    byEmail: byEmail as Customer | null,
  });

  let customer: Customer;

  if (decision.type === "already_linked") {
    if (!byAuthId) throw new Error("This email belongs to another account");
    customer = byAuthId as Customer;
  } else if (decision.type === "link_existing") {
    const { data, error } = await admin
      .from("customers")
      .update({ auth_user_id: user.id })
      .eq("id", decision.customerId)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to link customer: ${error.message}`);
    customer = data as Customer;
  } else {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
    const [firstName, ...rest] = fullName.split(" ").filter(Boolean);
    const { data, error } = await admin
      .from("customers")
      .insert({
        email,
        auth_user_id: user.id,
        first_name: firstName ?? null,
        last_name: rest.length ? rest.join(" ") : null,
        ...(options.locale ? { locale: options.locale } : {}),
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create customer: ${error.message}`);
    customer = data as Customer;
  }

  if (customer.auth_user_id === user.id) {
    await claimOnSignIn(customer, { admin });
  }

  await associateGuestOrdersToCustomer(customer);

  await touchCustomerLastSeen(customer, admin);

  await touchAccountProviders(customer, user, admin);

  return customer;
}

export const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

export function lastSeenIsStale(stored: string | null | undefined, now: Date): boolean {
  if (!stored) return true;
  const at = Date.parse(stored);
  return Number.isNaN(at) || now.getTime() - at >= LAST_SEEN_INTERVAL_MS;
}

export async function touchCustomerLastSeen(
  customer: Pick<Customer, "id" | "account_last_seen_at">,
  admin: ReturnType<typeof supabaseAdmin> = supabaseAdmin(),
  now: Date = new Date(),
): Promise<boolean> {
  const stored = customer.account_last_seen_at ?? null;
  if (!lastSeenIsStale(stored, now)) return false;
  try {
    const update = admin
      .from("customers")
      .update({ account_last_seen_at: now.toISOString() })
      .eq("id", customer.id);
    const { data, error } = await (stored == null
      ? update.is("account_last_seen_at", null)
      : update.lt("account_last_seen_at", new Date(now.getTime() - LAST_SEEN_INTERVAL_MS).toISOString())
    ).select("id");
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export function accountProvidersOf(user: Pick<User, "identities">): string[] | null {
  if (!Array.isArray(user.identities)) return null;
  const providers = user.identities
    .map((i) => (typeof i?.provider === "string" ? i.provider.trim() : ""))
    .filter(Boolean);
  return [...new Set(providers)].sort();
}

function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, "\\$&")}"`).join(",")}}`;
}

export async function touchAccountProviders(
  customer: Pick<Customer, "id" | "auth_user_id" | "account_providers">,
  user: Pick<User, "id" | "identities">,
  admin: ReturnType<typeof supabaseAdmin> = supabaseAdmin(),
): Promise<boolean> {
  if (customer.auth_user_id !== user.id) return false;
  const next = accountProvidersOf(user);
  if (!next) return false;
  const stored = customer.account_providers ?? [];
  if (stored.length === next.length && stored.every((p, i) => p === next[i])) return false;
  try {
    const { data, error } = await admin
      .from("customers")
      .update({ account_providers: next })
      .eq("id", customer.id)
      .eq("auth_user_id", user.id)
      .eq("account_providers", pgTextArray(stored))
      .select("id");
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function associateGuestOrdersToCustomer(
  customer: Pick<Customer, "id" | "email">,
  admin: ReturnType<typeof supabaseAdmin> = supabaseAdmin(),
): Promise<number> {
  const email = (customer.email ?? "").toLowerCase().trim();
  if (!email) return 0;

  const { data, error } = await admin
    .from("orders")
    .update({ customer_id: customer.id })
    .is("customer_id", null)
    .ilike("email", escapeLikePattern(email))
    .select("id");

  if (error) {
    throw new Error(`Failed to associate guest orders: ${error.message}`);
  }
  return data?.length ?? 0;
}
