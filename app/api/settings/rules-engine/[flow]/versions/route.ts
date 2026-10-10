import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { isRuleFlow, listVersions } from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ flow: string }> };

/** GET published versions for a flow (newest first). */
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

  const versions = await listVersions(flow);
  return NextResponse.json({ ok: true, versions });
}
