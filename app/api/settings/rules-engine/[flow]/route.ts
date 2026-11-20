import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { getDraft, isRuleFlow, saveDraft } from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GraphSchema = z.object({
  nodes: z.array(z.record(z.string(), z.unknown())),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      handle: z.string().optional(),
    }),
  ),
});

type Ctx = { params: Promise<{ flow: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAdminContext("rules-engine");
  } catch (res) {
    return res as NextResponse;
  }

  const { flow } = await ctx.params;
  if (!isRuleFlow(flow)) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 });
  }

  const draft = await getDraft(flow);
  return NextResponse.json({ ok: true, draft });
}

export async function PUT(req: Request, ctx: Ctx) {
  let authorId: string | null = null;
  try {
    const admin = await requireAdminContext("rules-engine");
    authorId = admin.userId;
  } catch (res) {
    return res as NextResponse;
  }

  const { flow } = await ctx.params;
  if (!isRuleFlow(flow)) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z.object({ graph: GraphSchema }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const draft = await saveDraft(flow, parsed.data.graph as never, authorId);
  return NextResponse.json({ ok: true, draft });
}
