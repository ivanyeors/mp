import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";
import { customerCancelDeniedReason } from "@/lib/results/post-delivery-refund";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customer = await linkCustomerToAuthUser(user);
  const { orderNumber } = await params;
  const admin = supabaseAdmin();

  const { data: order, error } = await admin
    .from("orders")
    .select("id, status, items:order_items(customization_snapshot)")
    .eq("order_number", decodeURIComponent(orderNumber))
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const reason = customerCancelDeniedReason(order.items ?? []);
  return NextResponse.json({ error: reason }, { status: 400 });
}
