import { NextResponse } from "next/server";

import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { invalidateTag } from "@/lib/cache/invalidate";
import { isSlideInPageKey, type SlideInPageKey } from "@/lib/slide-in-pages/pages";
import { summariseSlideInPending } from "@/lib/slide-in-pages/sections";
import { listSlideInRows, SLIDE_IN_SECTIONS_TAG } from "@/lib/slide-in-pages/store";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ page: string }> };

async function guard(params: Params["params"]) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return { denied: res as NextResponse } as const;
  }
  const { page } = await params;
  if (!isSlideInPageKey(page)) {
    return { denied: NextResponse.json({ error: "No such sub page" }, { status: 404 }) } as const;
  }
  return { ctx, page: page as SlideInPageKey } as const;
}

/** GET — what a publish of this sub page would ship. */
export async function GET(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("denied" in g) return g.denied;
  try {
    return NextResponse.json({ ok: true, pending: summariseSlideInPending(g.page, await listSlideInRows(g.page)) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/**
 * POST — apply this sub page's drafts to the live slide-in, atomically, and write one
 * **Publish snapshot**. Other sub pages and the landing page are untouched.
 */
export async function POST(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("denied" in g) return g.denied;
  try {
    const pending = summariseSlideInPending(g.page, await listSlideInRows(g.page));
    if (pending.total === 0) {
      return NextResponse.json({ error: "There is nothing to publish." }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin().rpc("publish_slide_in_draft", {
      p_page: g.page,
      actor: g.ctx.email ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The root layout serves these to every page from a cache; drop it now so the very
    // next visitor sees the publish.
    invalidateTag(SLIDE_IN_SECTIONS_TAG);

    await recordAdminAction({
      actor: g.ctx,
      action: "slide_in_section.publish",
      entityType: "slide_in_page",
      entityId: g.page,
      after: { snapshotId: data, ...pending },
    });

    return NextResponse.json({ ok: true, snapshotId: data, published: pending });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/** DELETE — discard this sub page's drafts. Published content is untouched. */
export async function DELETE(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("denied" in g) return g.denied;
  try {
    const pending = summariseSlideInPending(g.page, await listSlideInRows(g.page));
    const { error } = await supabaseAdmin().rpc("discard_slide_in_draft", { p_page: g.page });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAdminAction({
      actor: g.ctx,
      action: "slide_in_section.discard_draft",
      entityType: "slide_in_page",
      entityId: g.page,
      before: pending,
    });

    return NextResponse.json({ ok: true, discarded: pending });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
