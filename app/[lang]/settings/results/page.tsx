import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listMpConfigResponses } from "@/lib/results/admin/responses-list";
import { listStaffProfiles } from "@/lib/staff/admin";
import ResultsPage, { type ResultsInitialData } from "./results-client";

export const runtime = "nodejs";

/**
 * Server shell for the Results admin page. The response list (the client's
 * first page: limit 200, offset 0) and the Staff profiles were two
 * post-hydration fetches; they now resolve concurrently on the server.
 */
export default async function ResultsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("results", locale);

  const [responses, staff] = await Promise.all([
    // Mirrors the client's first-mount request: pageLimit 200, offset 0.
    listMpConfigResponses({ limit: "200", offset: "0" }),
    listStaffProfiles({ includeArchived: true }).catch(() => null),
  ]);

  const initialData: ResultsInitialData = {
    responses:
      responses.status === 200
        ? (responses.body as unknown as ResultsInitialData["responses"])
        : null,
    staff: staff ? { ok: true, rows: staff } : null,
  };

  return <ResultsPage initialData={initialData} />;
}
