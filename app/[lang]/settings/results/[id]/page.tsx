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
        .catch(() => null)
    : Promise.resolve(null);

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
    canEditCustomer: hasPermission(ctx, "customers-edit"),
  };

  return <ResultDetailPage initialData={initialData} />;
}
