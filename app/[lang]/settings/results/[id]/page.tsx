import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { customerIdForResult } from "@/lib/crm/customer-link";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  canEditFillingMix,
  loadFillingItems,
  loadResultAssignPrep,
} from "@/lib/results/admin/detail-prep";
import { loadResultFillingMix } from "@/lib/results/admin/filling-mix";
import { loadMpConfigResponseDetail } from "@/lib/results/admin/response-detail";
import { loadResultCustomerSummary } from "@/lib/results/admin/result-customer";
import ResultDetailPage, { type ResultDetailInitialData } from "./result-detail-client";

export const runtime = "nodejs";

/**
 * Server shell for the result detail page. This replaces a three-step client
 * waterfall: the response row, then the assignment preview once the row
 * arrived, then the filling items. The row is loaded first (the other two
 * depend on it) and — only when the page edits the filling mix (a held Result,
 * or a Draft Result laid out ahead of the customer) — the preview and the
 * filling items resolve together. The Result's own saved mix loads for every
 * Result: after assignment it is shown read-only.
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

  const fillingMixPromise = response
    ? loadResultFillingMix(
        supabaseAdmin(),
        String(response.id),
        response.product_type === "bolster" ? "bolster" : "pillow",
      )
        .then((r) => (r.ok ? r.mix : null))
        // Like the customer lookup, a failed read never fails the page: the client refetches it.
        .catch(() => null)
    : Promise.resolve(null);

  // The Customer panel (ADR 0051 d): who it is and their stage. A failed read
  // shows the panel without them, never fails the page.
  const customerPromise = customerIdPromise.then((cid) =>
    cid ? loadResultCustomerSummary(supabaseAdmin(), cid).catch(() => null) : null,
  );

  const [[assignPrep, fillingItems], customerId, fillingMix, customer] = await Promise.all([
    response && canEditFillingMix(response)
      ? Promise.all([
          loadResultAssignPrep(
            response,
            detail.status === 200 ? (detail.body.suggestion?.recommended ?? null) : null,
          ),
          loadFillingItems(),
        ])
      : Promise.resolve([null, null] as const),
    customerIdPromise,
    fillingMixPromise,
    customerPromise,
  ]);

  const initialData: ResultDetailInitialData = {
    detail:
      detail.status === 200
        ? (detail.body as unknown as ResultDetailInitialData["detail"])
        : null,
    assignPrep: assignPrep as ResultDetailInitialData["assignPrep"],
    fillingItems,
    fillingMix,
    customerId,
    customer,
    canViewCustomers: hasPermission(ctx, "customers"),
    // Linking or creating changes a Customer: `customers-edit` (ADR 0051 g).
    canEditCustomer: hasPermission(ctx, "customers-edit"),
  };

  return <ResultDetailPage initialData={initialData} />;
}
