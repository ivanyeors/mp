import { NextResponse } from "next/server";
import { listAdminOrders } from "@/lib/ecommerce/admin/orders-list";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const result = await listAdminOrders({
    status: searchParams.get("status"),
    email: searchParams.get("email"),
    customer_id: searchParams.get("customer_id"),
    search: searchParams.get("search"),
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    sort: searchParams.get("sort"),
    date_from: searchParams.get("date_from"),
    date_to: searchParams.get("date_to"),
  });

  return NextResponse.json(result.body, { status: result.status });
}
