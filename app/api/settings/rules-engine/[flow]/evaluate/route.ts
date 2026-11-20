import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import {
  evaluate,
  getLatestPublished,
  isRuleFlow,
  type RuleGraphJson,
} from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ flow: string }> };

const BodySchema = z.object({
  inputs: z.record(z.string(), z.unknown()),
  graph: z
    .object({
      nodes: z.array(z.record(z.string(), z.unknown())),
      edges: z.array(
        z.object({
          id: z.string(),
          source: z.string(),
          target: z.string(),
          handle: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAdminContext("rules-engine");
  } catch (res) {
    return res as NextResponse;
  }

  const { flow } = await ctx.params;
  if (!isRuleFlow(flow)) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let graph = parsed.data.graph as RuleGraphJson | undefined;
  let graphVersionId: string | null = null;
  if (!graph) {
    const published = await getLatestPublished(flow);
    if (!published) {
      return NextResponse.json({ error: "No published graph for flow" }, { status: 404 });
    }
    graph = published.graph;
    graphVersionId = published.id;
  }

  const result = evaluate(flow, graph, parsed.data.inputs);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true, graphVersionId, result });
}
