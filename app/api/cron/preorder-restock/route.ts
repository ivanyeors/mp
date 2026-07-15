import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runPreOrderRestockNotices } from "@/lib/configurator/pre-order-restock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ponytail: manual/ops only — not in vercel.json (also chained from results-sla).

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // ponytail: open in dev when CRON_SECRET unset; set CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  try {
    const restock = await runPreOrderRestockNotices(supabaseAdmin(), { origin });
    return NextResponse.json({ ok: true, restock });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "restock notify failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
