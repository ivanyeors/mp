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
