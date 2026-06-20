import type { User } from "@supabase/supabase-js";
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
    .ilike("email", email)
    .maybeSingle();

  const decision = decideCustomerLink({
    authUserId: user.id,
    byAuthId: byAuthId as Customer | null,
    byEmail: byEmail as Customer | null,
  });

  if (decision.type === "already_linked") {
    return (byAuthId ?? byEmail) as Customer;
  }

  if (decision.type === "link_existing") {
    const { data, error } = await admin
      .from("customers")
      .update({ auth_user_id: user.id })
      .eq("id", decision.customerId)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to link customer: ${error.message}`);
    return data as Customer;
  }

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
  return data as Customer;
}
