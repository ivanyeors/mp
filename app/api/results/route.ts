import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLS =
  "id, status, suggested_size, suggested_tier, assigned_size, assigned_tier, authorized_amount, final_amount, currency, access_token, created_at";

type ResultRow = {
  id: string;
  status: string | null;
  suggested_size: string | null;
  suggested_tier: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  authorized_amount: number | null;
  final_amount: number | null;
  currency: string | null;
  access_token: string | null;
  created_at: string;
};

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customer = await linkCustomerToAuthUser(user);
  const admin = supabaseAdmin();

  const [{ data: byCustomer }, { data: byEmail }] = await Promise.all([
    admin
      .from("mp_config_responses")
      .select(SELECT_COLS)
      .eq("customer_id", customer.id)
      .not("status", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    customer.email
      ? admin
          .from("mp_config_responses")
          .select(SELECT_COLS)
          .eq("customer_email", customer.email)
          .not("status", "is", null)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as ResultRow[] }),
  ]);

  const seen = new Set<string>();
  const rows = [...((byCustomer ?? []) as ResultRow[]), ...((byEmail ?? []) as ResultRow[])].filter(
    (r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    },
  );

  return NextResponse.json({ rows });
}
