import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { withLocale } from "@/lib/i18n/routing";
import AnalyticsClient from "./AnalyticsClient";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("analytics", locale);
  return <AnalyticsClient reportsHref={withLocale("/settings/analytics/reports", locale)} />;
}
