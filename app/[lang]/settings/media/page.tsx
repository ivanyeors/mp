import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { loadMediaGallerySeed } from "@/lib/media-assets/admin/gallery";
import MediaPage, { type MediaInitialData } from "./media-client";

export const runtime = "nodejs";

export default async function MediaRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("media", locale);

  const seed = await loadMediaGallerySeed().catch(() => null);

  return <MediaPage initialData={seed as MediaInitialData} />;
}
