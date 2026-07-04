import { getAuthUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Guest magic-link token or signed-in customer matching the Result. */
export async function authorizeResultAccess(
  row: {
    access_token: string | null;
    customer_id: string | null;
    customer_email: string | null;
  },
  token: string | null,
): Promise<boolean> {
  if (token && row.access_token && token === row.access_token) return true;

  const user = await getAuthUser();
  if (!user) return false;

  const admin = supabaseAdmin();
  const { data: customer } = await admin
    .from("customers")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) return false;

  return (
    customer.id === row.customer_id ||
    Boolean(
      row.customer_email &&
        customer.email?.toLowerCase() === row.customer_email.toLowerCase(),
    )
  );
}
