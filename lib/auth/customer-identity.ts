import type { User } from "@supabase/supabase-js";
import { claimOnSignIn } from "@/lib/customer-migration/claim";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/ecommerce";

/**
 * Customer identity linking.
 *
 * On first sign-in we link the Supabase auth user to a customer record by
 * matching the verified email (case-insensitive). If no customer exists, one is
 * created. The operation is idempotent: repeat sign-ins resolve to the same
 * customer.
 */

export type CustomerLinkDecision =
  | { type: "already_linked" }
  | { type: "link_existing"; customerId: string }
  | { type: "create" };

/**
 * Escapes SQL `LIKE`/`ILIKE` wildcards so an `ilike` filter behaves as an exact
 * case-insensitive match. Without this, an email containing `_` (legal in the
 * local part, e.g. `john_doe@x.com`) or `%` would be treated as a wildcard and
 * could match unrelated rows — which would wrongly link guest orders that don't
 * actually belong to the customer (#33).
 *
 * PostgREST also rewrites every `*` in a like/ilike value to `%`, so `*` needs
 * escaping too. `\*` arrives in Postgres as `\%`, a literal percent sign.
 * ponytail: there is no way to send a literal `*`, so an address containing one
 * never matches its own row; such addresses are vanishingly rare.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, (ch) => `\\${ch}`);
}

/**
 * Pure decision over the two candidate lookups (by auth id, by email).
 * Extracted so the linking policy is unit-testable without a database.
 */
export function decideCustomerLink(params: {
  authUserId: string;
  byAuthId: Pick<Customer, "id" | "auth_user_id"> | null;
  byEmail: Pick<Customer, "id" | "auth_user_id"> | null;
}): CustomerLinkDecision {
  const { authUserId, byAuthId, byEmail } = params;

  if (byAuthId) return { type: "already_linked" };

  if (byEmail) {
    // Email is unique; only adopt the row if it isn't already owned by someone.
    if (byEmail.auth_user_id == null || byEmail.auth_user_id === authUserId) {
      return { type: "link_existing", customerId: byEmail.id };
    }
    return { type: "already_linked" };
  }

  return { type: "create" };
}

/**
 * Links (or creates) the customer record for a signed-in Supabase auth user.
 * Runs with the service role so it can write across RLS. Returns the customer.
 *
 * After resolving the customer we backfill any prior guest orders that share
 * the verified email but were never linked to a customer record (see #33), so
 * historical purchases show up in the customer's order history.
 */
export async function linkCustomerToAuthUser(user: User): Promise<Customer> {
  const email = (user.email ?? "").toLowerCase().trim();
  if (!email) {
    throw new Error("Cannot link a customer for an auth user without an email");
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
    customer = (byAuthId ?? byEmail) as Customer;
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
    // create
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
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create customer: ${error.message}`);
    customer = data as Customer;
  }

  // The Claim (ADR 0028 f), for every decision type: someone who signed in
  // before it shipped, or whose Shopify row merged into an account they already
  // had, claims on this sign-in. For anyone else it is one indexed no-op
  // update. Only for a row this user owns, never one `already_linked` returned
  // because another login holds the email. Never throws.
  if (customer.auth_user_id === user.id) {
    await claimOnSignIn(customer, { admin });
  }

  await associateGuestOrdersToCustomer(customer);

  await touchCustomerLastSeen(customer, admin);

  return customer;
}

// ─── Account status: the last signed-in visit (migration slice 12) ──────────
//
// `account_linked_at` needs no code here: a trigger on `customers` stamps it
// whenever `auth_user_id` is bound and clears it when the login goes.

/** A visit rewrites `account_last_seen_at` only once it is this old. */
export const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

/** Whether a signed-in visit at `now` should rewrite `account_last_seen_at`. */
export function lastSeenIsStale(stored: string | null | undefined, now: Date): boolean {
  if (!stored) return true;
  const at = Date.parse(stored);
  return Number.isNaN(at) || now.getTime() - at >= LAST_SEEN_INTERVAL_MS;
}

/**
 * Records a signed-in visit: `account_last_seen_at`, at most once an hour per
 * Customer. It runs on every account page (through `linkCustomerToAuthUser`),
 * so it skips the write while the stored value is fresh, and the update itself
 * re-checks the value it read: of two concurrent page loads, the second
 * matches no row. Best-effort, like `recordAdminAction`: a failure is
 * swallowed and never breaks the page. Returns whether it wrote.
 */
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
    // The visit is a convenience for Staff; the account page must load.
    return false;
  }
}

/**
 * Backfills the order→customer link for prior email-only (guest) orders whose
 * email matches this customer's verified email but that were never associated
 * to a customer record (#33).
 *
 * Idempotent: only orders with a null `customer_id` are touched, so once an
 * order is linked, subsequent sign-ins match nothing and leave it untouched.
 * Orders whose email does not match are never affected. Returns the number of
 * orders newly linked.
 */
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
