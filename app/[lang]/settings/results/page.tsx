import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listMpConfigResponses } from "@/lib/results/admin/responses-list";
import { hasPermission } from "@/lib/auth/permissions";
import { listStaffProfiles, withoutLoginEmails } from "@/lib/staff/admin";
import ResultsPage, { type ResultsInitialData } from "./results-client";

export const runtime = "nodejs";

export default async function ResultsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const ctx = await requireAdminPage("results", locale);

  const [responses, staff] = await Promise.all([
    listMpConfigResponses({ limit: "200", offset: "0" }),
    listStaffProfiles({ includeArchived: true }).catch(() => null),
  ]);

  const initialData: ResultsInitialData = {
    responses:
      responses.status === 200
        ? (responses.body as unknown as ResultsInitialData["responses"])
        : null,
    staff: staff ? { ok: true, rows: hasPermission(ctx, "users") ? staff : withoutLoginEmails(staff) } : null,
  };

  return <ResultsPage initialData={initialData} />;
}
