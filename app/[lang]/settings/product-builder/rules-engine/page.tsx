import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

/** Default entry → Premium Mpillow flow. */
export default async function RulesEngineIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("rules-engine", locale);
  redirect(
    withLocale("/settings/product-builder/rules-engine/premium-mpillow", locale),
  );
}