import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { customerIdForResult } from "@/lib/crm/customer-link";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  canAssignResult,
  loadFillingItems,
  loadResultAssignPrep,
} from "@/lib/results/admin/detail-prep";
import { loadMpConfigResponseDetail } from "@/lib/results/admin/response-detail";
import ResultDetailPage, { type ResultDetailInitialData } from "./result-detail-client";

export const runtime = "nodejs";

/**
 * Server shell for the result detail page. This replaces a three-step client
 * waterfall: the response row, then the assignment preview once the row
 * arrived, then the filling items. The row is loaded first (the other two
 * depend on it) and — only when the row is assignable, the same `canAssign`
 * gate the client applies — the preview and the filling items resolve together.
 */
export default async function ResultDetailRoute({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const ctx = await requireAdminPage("results", locale);

  const detail = await loadMpConfigResponseDetail(id);
  const response = detail.status === 200 ? detail.body.response : null;

  // *Open customer* (PRD-crm-retention-loop slice 02), only for Staff who can open it.
  const customerIdPromise =
    response && hasPermission(ctx, "customers")
      ? customerIdForResult(supabaseAdmin(), {
          customer_id: typeof response.customer_id === "string" ? response.customer_id : null,
          customer_email: typeof response.customer_email === "string" ? response.customer_email : null,
        }).catch(() => null)
      : Promise.resolve(null);

  const [[assignPrep, fillingItems], customerId] = await Promise.all([
    response && canAssignResult(response)
      ? Promise.all([
          loadResultAssignPrep(
            response,
            detail.status === 200 ? detail.body.suggestion.recommended : null,
          ),
          loadFillingItems(),
        ])
      : Promise.resolve([null, null] as const),
    customerIdPromise,
  ]);

  const initialData: ResultDetailInitialData = {
    detail:
      detail.status === 200
        ? (detail.body as unknown as ResultDetailInitialData["detail"])
        : null,
    assignPrep: assignPrep as ResultDetailInitialData["assignPrep"],
    fillingItems,
    customerId,
  };

  return <ResultDetailPage initialData={initialData} />;
}
