import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { loadMediaGallerySeed } from "@/lib/media-assets/admin/gallery";
import MediaPage, { type MediaInitialData } from "./media-client";

export const runtime = "nodejs";

/**
 * Server shell for the Media gallery. The asset registry and the folder list
 * are loaded during the render; the landing-image overrides and the usage map
 * remain client fetches, and an empty registry still falls through to the
 * client so its one-shot bucket backfill can run.
 */
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
