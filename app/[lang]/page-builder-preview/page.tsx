import { requireAdminPage } from "@/lib/auth/admin";
import { loadLandingPageData } from "@/lib/landing-page-data";
import { listLandingSectionRows } from "@/lib/landing-sections";
import { draftSections } from "@/lib/page-builder/draft";
import { LandingSectionsList } from "@/components/sections/landing/landing-sections-list";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import type { Metadata } from "next";

export const runtime = "nodejs";

/** Never indexable — it renders unpublished copy. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * **Preview mode** — the landing page with Section drafts applied, embedded same-origin
 * in the Page Builder.
 *
 * Gated on the existing admin context rather than Next draft mode: the root layout
 * already reads cookies so every route is dynamic, meaning draft mode would buy no cache
 * bypass we need while costing the Data Cache — the reviews call it would uncache is a
 * paid API cached for an hour, and the builder reloads this route on every edit. Its
 * bypass cookie is also browser-wide, so Staff would see draft content on the real site
 * in every tab and believe they had published.
 *
 * It renders `LandingSectionsList`, the same component the public route uses, so preview
 * and production cannot drift.
 */
export default async function PageBuilderPreview({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  const m = getMessages(locale);
  const [{ images, prices, landingRatings }, rows] = await Promise.all([
    loadLandingPageData(),
    listLandingSectionRows(),
  ]);

  return (
    <div className="relative min-h-screen min-w-0 max-w-full bg-background">
      <main className="relative min-w-0 max-w-full overflow-x-hidden" data-page-builder-preview="">
        <LandingSectionsList
          sections={draftSections(rows)}
          messages={m}
          locale={locale}
          images={images}
          prices={prices}
          landingRatings={landingRatings}
          preview
        />
      </main>
    </div>
  );
}
