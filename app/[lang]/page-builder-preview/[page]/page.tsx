import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SlideInPagePreview } from "@/components/slide-in-pages/slide-in-page-preview";
import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { isSlideInPageKey } from "@/lib/slide-in-pages/pages";
import { slideInSectionViews } from "@/lib/slide-in-pages/sections";
import { listSlideInRows } from "@/lib/slide-in-pages/store";

export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
