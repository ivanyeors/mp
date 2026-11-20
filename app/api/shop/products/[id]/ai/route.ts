import { NextResponse } from "next/server";
import { recordAdminAction } from "@/lib/auth/audit";
import { requireAdminContext } from "@/lib/auth/admin";
import { aiUsageAuditEntry } from "@/lib/ai/usage";
import { openAiWritingCall } from "@/lib/ai/writing-call";
import { ProductAiRequestSchema, productAiBlocker } from "@/lib/ecommerce/ai-product-shape";
import { PRODUCT_AI_KIND, PRODUCT_AI_LIMIT_LEAD, productFactsFrom, runProductAi } from "@/lib/ecommerce/ai-product-writing";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("products");
  } catch (res) {
    return res as NextResponse;
  }
  const { id } = await params;

  const parsed = ProductAiRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the request." }, { status: 400 });
  const request = parsed.data;
  const blocked = productAiBlocker(request);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const admin = supabaseAdmin();
  const call = await openAiWritingCall(admin, ctx.memberId, { lead: PRODUCT_AI_LIMIT_LEAD });
  if (!call.ok) return NextResponse.json({ error: call.error }, { status: call.status });

  const { data: row, error } = await admin
    .from("products")
    .select("product_type, tags, category_id, product_options(name, values, position), product_variants(title, option1, option2, option3, is_active, position)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: `Couldn't read the product: ${error.message}` }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Couldn't find this product." }, { status: 404 });

  let category: string | null = null;
  if (row.category_id) {
    const { data: cat } = await admin.from("categories").select("slug, content").eq("id", row.category_id).maybeSingle();
    const c = cat as { slug?: string; content?: Record<string, { name?: string }> } | null;
    category = c?.content?.["en-US"]?.name?.trim() || c?.slug || null;
  }

  const facts = productFactsFrom(row, category);
  const outcome = await runProductAi(request, facts, { client: call.client, settings: call.settings, signal: req.signal });
  const { action, after } = aiUsageAuditEntry(PRODUCT_AI_KIND[request.kind], {
    model: outcome.model,
    usage: { input_tokens: outcome.inputTokens, output_tokens: outcome.outputTokens },
  });
  await recordAdminAction({
    actor: ctx,
    action,
    entityType: "product",
    entityId: id,
    after: {
      ...after,
      ended: outcome.stopped ? "stopped" : outcome.ok ? "suggested" : "failed",
      attempts: outcome.attempts,
      locale: request.locale,
      ...(request.kind === "description"
        ? { mode: request.mode, parts: request.parts, length: request.length, brief: request.brief.length > 0 }
        : { keyphrase: request.keyphrase.length > 0 }),
    },
  });
  if (outcome.stopped) return NextResponse.json({ error: "Stopped." }, { status: 499 });
  if (!outcome.ok || !outcome.result) return NextResponse.json({ error: outcome.error ?? "Claude couldn't answer." }, { status: 502 });
  return NextResponse.json(outcome.result, { headers: { "cache-control": "no-store" } });
}
