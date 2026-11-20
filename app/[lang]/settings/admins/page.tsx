import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export default async function AdminUsersRedirect({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(withLocale("/settings/users?tab=members", isSupportedLocale(lang) ? lang : DEFAULT_LOCALE));
}
