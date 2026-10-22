"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { loadCustomerPurchasesReport } from "@/lib/finance-reports/load-customer-purchases";
import { parseReportPeriod } from "@/lib/finance-reports/period";
import {
  listRecentSends,
  parseNote,
  parseRecipients,
  sendCustomerPurchasesReport,
} from "@/lib/finance-reports/send";

// ponytail: do not `export type { X }` from "use server" — SWC emits runtime refs

/** Build the customer purchases report for a period (Singapore days). */
export async function generateCustomerPurchasesReport(input: { from: string; to: string }) {
  await assertAdmin("analytics");
  const parsed = parseReportPeriod(input.from, input.to);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  try {
    const report = await loadCustomerPurchasesReport(parsed.period);
    return { ok: true as const, report };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not build the report" };
  }
}

/**
 * Email the report to the chosen recipients. Rebuilt here from the period,
 * never taken from the browser, so what is sent is what the database says.
 */
export async function emailCustomerPurchasesReport(input: {
  from: string;
  to: string;
  recipients: string[];
  note?: string | null;
}) {
  const actor = await assertAdmin("analytics-reports");
  const parsed = parseReportPeriod(input.from, input.to);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const recipients = parseRecipients(input.recipients);
  if (!recipients.ok) return { ok: false as const, error: recipients.error };

  try {
    const report = await loadCustomerPurchasesReport(parsed.period);
    const outcome = await sendCustomerPurchasesReport({
      actor,
      report,
      recipients: recipients.recipients,
      note: parseNote(input.note),
    });
    const recent = await listRecentSends().catch(() => null);
    return { ok: true as const, ...outcome, recent };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not send the report" };
  }
}
