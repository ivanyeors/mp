import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { isSlideInPageKey } from "@/lib/slide-in-pages/pages";
import { slideInSectionViews, summariseSlideInPending } from "@/lib/slide-in-pages/sections";
import { listSlideInRows } from "@/lib/slide-in-pages/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ page: string }> }) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { page } = await params;
  if (!isSlideInPageKey(page)) {
    return NextResponse.json({ error: "No such sub page" }, { status: 404 });
  }

  try {
    const rows = await listSlideInRows(page);
    return NextResponse.json({
      ok: true,
      sections: slideInSectionViews(page, rows, "draft"),
      pending: summariseSlideInPending(page, rows),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
