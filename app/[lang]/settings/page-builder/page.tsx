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

/**
 * The Page Builder edits the landing page, or — with `?page=<key>` — one of the sub
 * pages it opens (CONTEXT.md — **Slide-in section**).
 *
 * Sections are read on the server so the builder mounts with its list instead of
 * fetching it after hydration. A failed read must not look like "no sections": leave
 * `initialData` undefined so the client runs its own fetch and surfaces the error.
 */
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
        // A different sub page is a different builder: drop the old one's state.
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

  // The builder edits the Section draft, so it mounts with drafts applied.
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
