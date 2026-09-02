import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listLandingSections } from "@/lib/landing-sections";
import PageBuilderPage from "./page-builder-client";

export const runtime = "nodejs";

/**
 * Landing sections are read on the server (same rows `/api/landing-sections`
 * returns) so the builder mounts with its list instead of fetching it after
 * hydration.
 */
export default async function PageBuilderRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  // A failed read must not look like "no sections": leave `initialData`
  // undefined so the client runs its own mount fetch and surfaces the error.
  const sections = await listLandingSections().catch(() => null);
  return (
    <PageBuilderPage initialData={sections ? { ok: true, sections } : undefined} />
  );
}
