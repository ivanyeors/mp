import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { isRuleFlow, publishDraft } from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ flow: string }> };

export async function POST(_req: Request, ctx: Ctx) {
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

  const result = await publishDraft(flow, authorId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true, published: result.published });
}
