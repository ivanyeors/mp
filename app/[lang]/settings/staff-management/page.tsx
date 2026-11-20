import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export default async function StaffManagementRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { lang } = await params;
  const { tab } = await searchParams;
  const target = (Array.isArray(tab) ? tab[0] : tab) === "telegram" ? "telegram" : "profiles";
  redirect(withLocale(`/settings/users?tab=${target}`, isSupportedLocale(lang) ? lang : DEFAULT_LOCALE));
}
