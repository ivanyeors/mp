import { NextResponse } from "next/server";
import { renderContactSheet } from "@/lib/email/contact-sheet";
import { isEmailPreviewAllowed } from "@/lib/email/preview-guard";

// Every template on one page. A static segment, which Next resolves ahead of
// the sibling [id] dynamic route, so there is no collision with a template
// whose id happened to be "all".
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isEmailPreviewAllowed()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const fixture =
    new URL(req.url).searchParams.get("fixture") === "hostile" ? "hostile" : "happy";

  return new NextResponse(
    renderContactSheet({ root: process.cwd(), fixture }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
