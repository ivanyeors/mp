import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import {
  activeDiscoverySourceOptions,
  getDiscoverySourceCatalog,
} from "@/lib/discovery-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: active Discovery source options for configurator preview.
 * GET /api/discovery-source?locale=en-US
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const localeParam = searchParams.get("locale") ?? DEFAULT_LOCALE;
  const locale: Locale = isSupportedLocale(localeParam) ? localeParam : DEFAULT_LOCALE;

  const catalog = await getDiscoverySourceCatalog();
  const options = activeDiscoverySourceOptions(catalog).map((o) => ({
    id: o.id,
    label: o.labels[locale] ?? o.labels[DEFAULT_LOCALE],
    labels: o.labels,
  }));

  return NextResponse.json({ ok: true, locale, options });
}
