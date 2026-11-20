import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listLandingSectionRows } from "@/lib/landing-sections";
import { draftSections, summarisePending } from "@/lib/page-builder/draft";
import { isSlideInPageKey } from "@/lib/slide-in-pages/pages";
import { slideInSectionViews, summariseSlideInPending } from "@/lib/slide-in-pages/sections";
import { listSlideInRows } from "@/lib/slide-in-pages/store";
import PageBuilderPage from "./page-builder-client";
import SlideInBuilder from "./slide-in-builder-client";

export const runtime = "nodejs";

export default async function PageBuilderRoute({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  const page = typeof query.page === "string" ? query.page : undefined;
  if (page && isSlideInPageKey(page)) {
    const rows = await listSlideInRows(page).catch(() => null);
    return (
      <SlideInBuilder
        key={page}
        page={page}
        initialData={
          rows
            ? { sections: slideInSectionViews(page, rows, "draft"), pending: summariseSlideInPending(page, rows) }
            : undefined
        }
      />
    );
  }

  const rows = await listLandingSectionRows().catch(() => null);
  return (
    <PageBuilderPage
      initialData={
        rows
          ? { ok: true, sections: draftSections(rows), pending: summarisePending(rows) }
          : undefined
      }
    />
  );
}
