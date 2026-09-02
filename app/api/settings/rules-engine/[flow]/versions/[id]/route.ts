import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { getPublishedVersion, isRuleFlow } from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ flow: string; id: string }> };

/** GET one published version including its graph (the list omits graphs). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  const { flow, id } = await ctx.params;
  if (!isRuleFlow(flow)) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 });
  }

  const version = await getPublishedVersion(flow, id);
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, version });
}
