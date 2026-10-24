import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { MIDVIEW_08_83 } from "@/lib/showroom/midview-08-83";
import { ShowroomViewer } from "./showroom-viewer";

export default async function ShowroomPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  // The model reaches the browser only through this page, after the guard.
  await requireAdminPage("showroom", locale);
  return <ShowroomViewer unit={MIDVIEW_08_83} />;
}
