import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getFaqPageData, stripMarkdownForSchema } from "@/lib/faq";

export const runtime = "nodejs";

/**
 * Public FAQ read endpoint.
 * GET /api/faq?locale=en-US&format=json|text
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const localeParam = searchParams.get("locale") ?? DEFAULT_LOCALE;
  const locale: Locale = isSupportedLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const format = searchParams.get("format") ?? "json";

  const data = await getFaqPageData(locale, { visibleOnly: true });

  if (format === "text") {
    const lines: string[] = ["# Mpillow FAQ", ""];
    for (const cat of data) {
      lines.push(`## ${cat.label}`, "");
      for (const item of cat.items) {
        lines.push(`### ${item.question}`, "");
        lines.push(stripMarkdownForSchema(item.answer), "");
      }
    }
    return new NextResponse(lines.join("\n"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    ok: true,
    locale,
    categories: data.map((cat) => ({
      key: cat.key,
      label: cat.label,
      items: cat.items.map((item) => ({
        slug: item.slug,
        question: item.question,
        answer: item.answer,
      })),
    })),
  });
}
