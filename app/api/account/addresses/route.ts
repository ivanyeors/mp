import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AddressInputSchema } from "@/lib/shop/customer-addresses";

export const runtime = "nodejs";

/**
 * Customer-facing saved-address endpoint used by the account area and checkout.
 * Unlike the admin route under /api/shop/customers/[id]/addresses, this is
 * scoped to the *signed-in* shopper: it links the auth user to their customer
 * record and only ever touches that customer's rows.
 */

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: true, signedIn: false, addresses: [], email: null });
  }

  const customer = await linkCustomerToAuthUser(user);
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", customer.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    signedIn: true,
    addresses: data ?? [],
    email: customer.email,
  });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = AddressInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid address" },
      { status: 400 },
    );
  }

  const customer = await linkCustomerToAuthUser(user);
  const admin = supabaseAdmin();

  // Keep at most one default per customer (matches idx_customer_addresses_one_default).
  if (parsed.data.is_default) {
    await admin
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", customer.id)
      .eq("is_default", true);
  }

  const { data, error } = await admin
    .from("customer_addresses")
    .insert({ ...parsed.data, customer_id: customer.id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, address: data });
}
