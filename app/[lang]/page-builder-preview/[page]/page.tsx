import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SlideInPagePreview } from "@/components/slide-in-pages/slide-in-page-preview";
import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { isSlideInPageKey } from "@/lib/slide-in-pages/pages";
import { slideInSectionViews } from "@/lib/slide-in-pages/sections";
import { listSlideInRows } from "@/lib/slide-in-pages/store";

export const runtime = "nodejs";

/** Never indexable — it renders unpublished copy. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * **Preview mode** for one of the landing page's sub pages (a learn-more slide-in), with
 * its Section drafts applied, embedded same-origin in the Page Builder. Same gate as the
 * landing preview: the admin context, not Next draft mode.
 */
export default async function SlideInPreviewRoute({
  params,
}: {
  params: Promise<{ lang: string; page: string }>;
}) {
  const { lang, page } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);
  if (!isSlideInPageKey(page)) notFound();

  const rows = await listSlideInRows(page);

  return (
    <main className="relative min-w-0 max-w-full overflow-x-hidden" data-page-builder-preview="">
      <SlideInPagePreview page={page} views={slideInSectionViews(page, rows, "draft")} />
    </main>
  );
}
