import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAdminContext } from "@/lib/auth/admin";
import { resolveTikTokLink } from "@/lib/tiktok/resolve";

export const runtime = "nodejs";

const BodySchema = z.object({ url: z.string().min(1).max(2048) });

/**
 * POST /api/tiktok/resolve
 * Checks a pasted TikTok link for the Page Builder: follows a share link to its
 * post and asks TikTok whether the post can be embedded. Returns the canonical
 * link to store. Only Staff who can edit the page builder may call it.
 */
export async function POST(req: Request) {
  try {
    await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Paste a TikTok link." }, { status: 400 });
  }

  const result = await resolveTikTokLink(parsed.data.url);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
