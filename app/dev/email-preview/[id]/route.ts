import { NextResponse } from "next/server";
import { forceDarkMode } from "@/lib/email/base";
import { isEmailPreviewAllowed } from "@/lib/email/preview-guard";
import { getEmailCase, type EmailFixture } from "@/lib/email/registry";

// Renders one registered template as a real document, so the preview iframe
// shows the actual email rather than React-normalised markup. `dark=1` shows it
// as a reader in dark mode sees it: the shell's own dark rules, forced on
// (PRD-campaign-email-editor slice 15). The text and JSON are as sent.
export const dynamic = "force-dynamic";

function parseFixture(value: string | null): EmailFixture {
  return value === "hostile" ? "hostile" : "happy";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // Return a plain 404 rather than notFound(): route handlers have no
  // not-found boundary to render, so an explicit response is unambiguous.
  if (!isEmailPreviewAllowed()) {
    return new NextResponse("Not found", { status: 404 });
  }

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

  const dark = url.searchParams.get("dark") === "1";
  return new NextResponse(dark ? forceDarkMode(rendered.html) : rendered.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Sample data only, but keep it out of any shared cache regardless.
      "cache-control": "no-store",
    },
  });
}
