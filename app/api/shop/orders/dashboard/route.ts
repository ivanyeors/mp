import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { loadOrdersDashboard } from "@/lib/ecommerce/admin/orders-dashboard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const result = await loadOrdersDashboard({
    date_from: searchParams.get("date_from"),
    date_to: searchParams.get("date_to"),
  });

  return NextResponse.json(result.body, { status: result.status });
}
