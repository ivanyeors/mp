import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

/** Old staff login URL → canonical Sign in with Admin Panel as `next`. */
export default async function SettingsLoginPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const adminHref = withLocale("/settings", locale);
  redirect(
    withLocale(`/account/login?next=${encodeURIComponent(adminHref)}`, locale),
  );
}
