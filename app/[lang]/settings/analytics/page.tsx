import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import AnalyticsClient from "./AnalyticsClient";
import { parseAnalyticsTab } from "./tabs";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const ctx = await requireAdminPage("analytics", locale);
  const { tab } = await searchParams;
  return <AnalyticsClient initialTab={parseAnalyticsTab(tab)} canSeeCost={hasPermission(ctx, "costings")} />;
}
