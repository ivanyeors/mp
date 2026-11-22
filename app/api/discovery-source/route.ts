import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { discoverySourceChoices, getDiscoverySourceCatalog } from "@/lib/discovery-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const localeParam = searchParams.get("locale") ?? DEFAULT_LOCALE;
  const locale: Locale = isSupportedLocale(localeParam) ? localeParam : DEFAULT_LOCALE;

  const catalog = await getDiscoverySourceCatalog();
  const options = discoverySourceChoices(catalog, locale);

  return NextResponse.json({ ok: true, locale, options });
}
