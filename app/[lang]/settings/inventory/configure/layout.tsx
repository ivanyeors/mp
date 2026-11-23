import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";

export default async function ConfigureLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireAdminPage("configure", isSupportedLocale(lang) ? lang : DEFAULT_LOCALE);
  return children;
}
