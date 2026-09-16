import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeResultAccess } from "@/lib/results/access";
import { reorderResult } from "@/lib/results/reorder";
import { statusUrl } from "@/lib/email/results";
import { getPublicOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().uuid().optional(),
});

/**
 * Rebuild an expired or declined customisation as a fresh, payable Result.
 *
 * POST, and only POST. The email's reorder button deep-links to the status page
 * rather than calling this, for the same reason the cancel link does: mail
 * providers and security gateways fetch every URL in an email before a human
 * sees it, and a GET that created an order would fill the queue with builds
 * nobody asked for.
 *
 * Creates nothing it cannot price: `reorderResult` deletes its own clone and
 * reports the reason if the build no longer assembles or an item is out of
 * stock. A Result that cannot be paid for is worse than a refusal, because it
 * looks to the customer like an order.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const token = parsed.data.token ?? null;
  const admin = supabaseAdmin();

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(row, token);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await reorderResult(admin, row);
  if (!result.ok) {
    // 409 for "this build cannot be rebuilt right now" — a state conflict the
    // customer can act on — and 500 only for a write that actually failed.
    const status = result.code ? 409 : 500;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    resultId: result.resultId,
    accessToken: result.accessToken,
    statusUrl: statusUrl(getPublicOrigin(req), result.resultId, result.accessToken),
    total: result.total,
    previousTotal: result.previousTotal,
    priceChanged: result.priceChanged,
    currency: result.currency,
  });
}
