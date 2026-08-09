import { NextResponse } from "next/server";
import { assertEmailPreviewAllowed } from "@/lib/email/preview-guard";
import { getEmailCase, type EmailFixture } from "@/lib/email/registry";

// Renders one registered template as a real document, so the preview iframe
// shows the actual email rather than React-normalised markup.
export const dynamic = "force-dynamic";

function parseFixture(value: string | null): EmailFixture {
  return value === "hostile" ? "hostile" : "happy";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  assertEmailPreviewAllowed();

  const { id } = await ctx.params;
  const entry = getEmailCase(id);
  if (!entry) {
    return NextResponse.json({ error: `Unknown template: ${id}` }, { status: 404 });
  }

  const url = new URL(req.url);
  const fixture = parseFixture(url.searchParams.get("fixture"));
  const rendered = entry.render(fixture);

  const format = url.searchParams.get("format");
  if (format === "text") {
    return new NextResponse(rendered.text, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (format === "json") {
    return NextResponse.json(rendered);
  }

  return new NextResponse(rendered.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Sample data only, but keep it out of any shared cache regardless.
      "cache-control": "no-store",
    },
  });
}
