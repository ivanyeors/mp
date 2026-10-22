/**
 * Emailing a finance report to the people a Member picks: other Members, or
 * any address (the outside accounts team has no Admin Panel login).
 *
 * One email per recipient, so nobody sees who else received it and one bad
 * address does not stop the rest. Every send is written to the audit log with
 * its recipients, since the report carries customer names off the platform.
 */

import { z } from "zod";
import { recordAdminAction } from "@/lib/auth/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { renderFinanceReportEmail } from "@/lib/email/finance-report";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  CHANNEL_LABELS,
  customerPurchasesCsv,
  type CustomerPurchasesReport,
} from "./customer-purchases";
import { periodLabel, periodSlug } from "./period";

/** More than this is a mailing list, not a report hand-off. */
export const MAX_RECIPIENTS = 20;
export const MAX_NOTE_LENGTH = 2000;

export const AUDIT_ACTION = "finance_report.send";

const recipientsSchema = z
  .array(z.string().trim().toLowerCase().pipe(z.string().email()))
  .min(1, "Pick at least one recipient")
  .max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients per send`)
  .transform((list) => [...new Set(list)]);

/** Lower-cased, de-duplicated, validated recipient addresses. */
export function parseRecipients(raw: unknown): { ok: true; recipients: string[] } | { ok: false; error: string } {
  const r = recipientsSchema.safeParse(raw);
  if (r.success) return { ok: true, recipients: r.data };
  const issue = r.error.issues[0];
  return { ok: false, error: issue?.code === "invalid_format" ? "One of the addresses is not an email address" : (issue?.message ?? "Invalid recipients") };
}

export function parseNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.trim().slice(0, MAX_NOTE_LENGTH);
  return note || null;
}

export function customerPurchasesFilename(report: CustomerPurchasesReport): string {
  return `customer-purchases-${periodSlug(report.period)}.csv`;
}

export type ReportRecipient = { email: string; role: string };

/** Active Members, to pick from. Anyone else is typed in. */
export async function listMemberRecipients(): Promise<ReportRecipient[]> {
  const admin = supabaseAdmin();
  const [members, roles] = await Promise.all([
    admin.from("admin_users").select("email, role_id").eq("is_active", true).order("email"),
    admin.from("admin_roles").select("id, name"),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (roles.error) throw new Error(roles.error.message);
  const roleName = new Map((roles.data ?? []).map((r) => [r.id as string, r.name as string]));
  return (members.data ?? []).map((m) => ({
    email: String(m.email).toLowerCase(),
    role: roleName.get(m.role_id as string) ?? "",
  }));
}

export type SendOutcome = {
  sent: string[];
  failed: Array<{ email: string; error: string }>;
};

export async function sendCustomerPurchasesReport(input: {
  actor: AdminContext;
  report: CustomerPurchasesReport;
  recipients: string[];
  note: string | null;
}): Promise<SendOutcome> {
  const { report, actor } = input;
  const attachmentName = customerPurchasesFilename(report);
  const csv = customerPurchasesCsv(report);
  const rendered = renderFinanceReportEmail({
    reportName: "Customer purchases",
    periodLabel: periodLabel(report.period),
    sentBy: actor.email,
    note: input.note,
    attachmentName,
    rowCount: report.rows.length,
    totals: report.totals,
    channels: (["platform", "shopify"] as const).flatMap((channel) =>
      report.byChannel[channel].map((t) => ({
        label: CHANNEL_LABELS[channel],
        currency: t.currency,
        saleCount: t.saleCount,
        net: t.net,
      })),
    ),
  });

  const transport = getEmailTransport();
  const from = getDefaultFromAddress();
  const outcome: SendOutcome = { sent: [], failed: [] };
  for (const to of input.recipients) {
    try {
      await transport.send({
        ...rendered,
        to,
        from,
        replyTo: actor.email,
        attachments: [{ filename: attachmentName, contentType: "text/csv", content: csv }],
      });
      outcome.sent.push(to);
    } catch (e) {
      outcome.failed.push({ email: to, error: e instanceof Error ? e.message : "Send failed" });
    }
  }

  await recordAdminAction({
    actor,
    action: AUDIT_ACTION,
    entityType: "finance_report",
    entityId: `customer-purchases:${periodSlug(report.period)}`,
    before: null,
    after: {
      report: "customer-purchases",
      period: report.period,
      rows: report.rows.length,
      totals: report.totals,
      sent: outcome.sent,
      failed: outcome.failed.map((f) => f.email),
      transport: transport.name,
    },
  });

  return outcome;
}

export type RecentSend = {
  at: string;
  by: string | null;
  period: { from: string; to: string } | null;
  sent: string[];
  failed: string[];
};

/** The last few sends, from the audit log, so the page shows what already went out. */
export async function listRecentSends(limit = 10): Promise<RecentSend[]> {
  const { data, error } = await supabaseAdmin()
    .from("admin_audit_log")
    .select("created_at, actor_email, after")
    .eq("action", AUDIT_ACTION)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const after = (row.after ?? {}) as { period?: { from?: string; to?: string }; sent?: unknown; failed?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return {
      at: row.created_at as string,
      by: (row.actor_email as string | null) ?? null,
      period: after.period?.from && after.period?.to ? { from: after.period.from, to: after.period.to } : null,
      sent: list(after.sent),
      failed: list(after.failed),
    };
  });
}
