/**
 * The Draft reminder job (ADR 0050): the IO around ./index. Runs daily,
 * chained onto `results-sla`. A manual re-run is safe: each reminder is
 * claimed in `customer_emails` (customer, template, Draft) before it is sent,
 * so nobody gets the same one twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAftercareEmailAllowed } from "@/lib/aftercare/channels";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { continueDraftUrl, draftAnswersFrom, draftConfiguratorOf } from "@/lib/configurator/continue-draft";
import { emailAddressOf } from "@/lib/email/campaign-transport";
import { getSupportInbox } from "@/lib/email/contact";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { dispatchCustomerEmail } from "@/lib/email/customer-emails";
import { DRAFT_REMINDER_EMAIL_COPY, renderDraftReminderEmail } from "@/lib/email/draft-reminder";
import {
  listUnsubscribeHeaders,
  unsubscribeConfigured,
  unsubscribeLinks,
} from "@/lib/marketing-consent/unsubscribe";
import {
  DRAFT_REMINDER_HORIZON_DAYS,
  DRAFT_REMINDER_SELECT,
  DRAFT_REMINDERS,
  DRAFT_REMINDERS_ENABLED_KEY,
  emailKey,
  emptyDraftReminderSkips,
  isGuestDraft,
  parseDraftRemindersEnabled,
  planDraftReminders,
  type DraftReminderRow,
  type DraftReminderSkip,
  type DraftReminderStep,
} from "./index";

/** At most this many sent a run; the rest stay due for the next, inside their window. */
export const DRAFT_REMINDER_BATCH = 100;
const PAGE = 1000;
const CHUNK = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DraftReminderReport = {
  ok: true;
  enabled: boolean;
  /** Set when nothing could be sent at all, and why. */
  blocked?: "unsubscribe_not_configured";
  sent: Record<DraftReminderStep, number>;
  failed: number;
  skipped: Record<DraftReminderSkip, number> & { over_batch: number; claimed_elsewhere: number };
  errors: string[];
};

type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
type Rangeable = Query & { range(from: number, to: number): Query };

async function readAll<T>(label: string, build: () => Rangeable): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function readIn<T>(label: string, ids: readonly string[], build: (chunk: string[]) => Query): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await build(ids.slice(i, i + CHUNK));
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

function emptyReport(enabled: boolean): DraftReminderReport {
  return {
    ok: true,
    enabled,
    sent: { "1d": 0, "1w": 0, "1m": 0 },
    failed: 0,
    skipped: { ...emptyDraftReminderSkips(), over_batch: 0, claimed_elsewhere: 0 },
    errors: [],
  };
}

export async function runDraftReminders(
  admin: SupabaseClient,
  ctx: { origin: string; now: Date },
): Promise<DraftReminderReport> {
  const { data: setting } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", DRAFT_REMINDERS_ENABLED_KEY)
    .maybeSingle();
  const enabled = parseDraftRemindersEnabled((setting as { value?: string } | null)?.value);
  const report = emptyReport(enabled);
  if (!enabled) return report;
  // Sent like a campaign: no Unsubscribe link, no reminder.
  if (!unsubscribeConfigured()) return { ...report, blocked: "unsubscribe_not_configured" };

  const since = new Date(ctx.now.getTime() - DRAFT_REMINDER_HORIZON_DAYS * DAY_MS).toISOString();
  const drafts = (
    await readAll<DraftReminderRow>("drafts", () =>
      admin
        .from("mp_config_responses")
        .select(DRAFT_REMINDER_SELECT)
        .is("status", null)
        .not("customer_email", "is", null)
        .gte("updated_at", since)
        .order("id"),
    )
  ).filter(isGuestDraft);
  if (drafts.length === 0) return report;

  const emails = [...new Set(drafts.map((d) => emailKey(d.customer_email!)))];
  const draftIds = drafts.map((d) => d.id);
  const firstStarted = drafts.reduce((min, d) => (d.created_at < min ? d.created_at : min), drafts[0].created_at);

  // A Result started since the Draft and then held, paid or submitted: they went on.
  const results = await readAll<{ customer_email: string | null; created_at: string }>("results", () =>
    admin
      .from("mp_config_responses")
      .select("customer_email, created_at")
      .not("status", "is", null)
      .not("customer_email", "is", null)
      .gte("created_at", firstStarted)
      .order("id"),
  );
  const resultStartedByEmail = new Map<string, string>();
  for (const r of results) {
    const key = emailKey(r.customer_email!);
    const seen = resultStartedByEmail.get(key);
    if (!seen || r.created_at > seen) resultStartedByEmail.set(key, r.created_at);
  }

  const customers = await readIn<{ id: string; email: string; marketing_email: string | null }>(
    "customers",
    emails,
    (chunk) => admin.from("customers").select("id, email, marketing_email").in("email", chunk),
  );
  const customersByEmail = new Map(customers.map((c) => [emailKey(c.email), c]));

  const ledger = await readIn<{ entity_id: string; template: string }>("ledger", draftIds, (chunk) =>
    admin
      .from("customer_emails")
      .select("entity_id, template")
      .in("entity_id", chunk)
      .in("template", DRAFT_REMINDERS.map((r) => r.template))
      .in("status", ["sent", "pending"]),
  );
  const sentByDraft = new Map<string, Set<string>>();
  for (const row of ledger) {
    const set = sentByDraft.get(row.entity_id) ?? new Set<string>();
    set.add(row.template);
    sentByDraft.set(row.entity_id, set);
  }

  // As campaigns are: an address one bounced from, or that reported one as spam, is left alone.
  const bounced = await readIn<{ customer_id: string; status: string | null; bounced_at: string | null; complained_at: string | null }>(
    "suppression",
    customers.map((c) => c.id),
    (chunk) =>
      admin
        .from("customer_campaign_sends")
        .select("customer_id, status, bounced_at, complained_at")
        .in("customer_id", chunk),
  );
  const suppressed = new Set(
    bounced
      .filter((s) => s.status === "bounced" || s.status === "complained" || s.bounced_at || s.complained_at)
      .map((s) => s.customer_id),
  );

  const { planned, skipped } = planDraftReminders({
    drafts,
    resultStartedByEmail,
    customersByEmail,
    sentByDraft,
    suppressed,
    now: ctx.now,
    allowed: (email) => isAftercareEmailAllowed(email),
  });
  Object.assign(report.skipped, skipped);
  report.skipped.over_batch = Math.max(0, planned.length - DRAFT_REMINDER_BATCH);

  const copy = await loadEmailCopy(DRAFT_REMINDER_EMAIL_COPY, { admin });
  const replyTo = getSupportInbox();
  // The header's mail fallback takes a bare address, not "Name <address>".
  const mailto = emailAddressOf(replyTo) ?? undefined;
  for (const { draft, email, customerId, reminder } of planned.slice(0, DRAFT_REMINDER_BATCH)) {
    const links = unsubscribeLinks(customerId, { origin: ctx.origin });
    if (!links) {
      report.errors.push(`${draft.id}: no unsubscribe link for customer ${customerId}`);
      continue;
    }
    const variant = draftConfiguratorOf(draft.data);
    const outcome = await dispatchCustomerEmail({
      admin,
      key: { customerId, template: reminder.template, entityId: draft.id },
      to: email,
      replyTo,
      headers: listUnsubscribeHeaders(links, mailto ? { mailto } : {}),
      render: () =>
        renderDraftReminderEmail(
          {
            step: reminder.step,
            name: draftAnswersFrom(draft.data).name ?? null,
            product: variant === "basic" ? "Basic Mpillow" : "Mpillow",
            continueUrl: continueDraftUrl({ origin: ctx.origin, id: draft.id, token: draft.access_token!, variant }),
            unsubscribeUrl: links.pageUrl,
            supportWhatsAppDisplay: SUPPORT_WHATSAPP_DISPLAY,
            supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
          },
          copy,
        ),
    });
    if (outcome.sent) report.sent[reminder.step] += 1;
    else if (outcome.skipped) report.skipped.claimed_elsewhere += 1;
    else {
      report.failed += 1;
      if (outcome.error) report.errors.push(`${draft.id}: ${outcome.error}`);
    }
  }
  return report;
}
