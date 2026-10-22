import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { loadCustomerPurchasesReport } from "@/lib/finance-reports/load-customer-purchases";
import { parseReportPeriod, previousMonth } from "@/lib/finance-reports/period";
import { listMemberRecipients, listRecentSends } from "@/lib/finance-reports/send";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import ReportsClient from "./ReportsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Analytics → Reports. Seeing a report is `analytics`, like its parent page;
 * emailing one is `analytics-reports`, since it carries customer names to
 * addresses outside the Admin Panel.
 */
export default async function ReportsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const ctx = await requireAdminPage("analytics", locale);
  const canSend = hasPermission(ctx, "analytics-reports");

  // Last month is what the accounts team asks for, so it is built before the page renders.
  const initialPeriod = previousMonth();
  const bounds = parseReportPeriod(initialPeriod.from, initialPeriod.to);
  const [initial, members, recent] = await Promise.all([
    bounds.ok
      ? loadCustomerPurchasesReport(bounds.period).then(
          (report) => ({ report, error: null }),
          (e: unknown) => ({ report: null, error: e instanceof Error ? e.message : "Could not build the report" }),
        )
      : Promise.resolve({ report: null, error: bounds.error }),
    canSend ? listMemberRecipients().catch(() => []) : Promise.resolve([]),
    canSend ? listRecentSends().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <ReportsClient
      analyticsHref={withLocale("/settings/analytics", locale)}
      initialPeriod={initialPeriod}
      initialReport={initial.report}
      initialError={initial.error}
      canSend={canSend}
      members={members}
      initialRecent={recent}
      selfEmail={ctx.email.toLowerCase()}
    />
  );
}
