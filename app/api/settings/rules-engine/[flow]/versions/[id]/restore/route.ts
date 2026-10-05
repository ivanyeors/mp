import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { isRuleFlow, restoreToDraft } from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ flow: string; id: string }> };

/** POST copy published version into draft without mutating history. */
export async function POST(_req: Request, ctx: Ctx) {
  let authorId: string | null = null;
  try {
    const admin = await requireAdminContext("rules-engine");
    authorId = admin.userId;
  } catch (res) {
    return res as NextResponse;
  }

  const { flow, id } = await ctx.params;
  if (!isRuleFlow(flow)) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 });
  }

  const result = await restoreToDraft(flow, id, authorId);
  if ("error" in result) {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json({ ok: true, draft: result });
}
