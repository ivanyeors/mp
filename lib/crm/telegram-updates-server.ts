import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendTelegram, type TelegramStatus } from "@/lib/telegram/notify";
import {
  CRM_TELEGRAM_LAST_SENT_KEY,
  CRM_TELEGRAM_UPDATES_KEY,
  TELEGRAM_UPDATE_TYPES,
  nextLastSent,
  parseTelegramUpdates,
  periodFor,
  previousSgtDay,
  previousSgtWeek,
  renderGoogleReviewsToMatch,
  renderNewSignUps,
  renderTelegramUpdateTest,
  renderWeeklySummary,
  sgtWeekday,
  type ScheduledTelegramUpdateType,
  type TelegramUpdateType,
  type TelegramUpdatesSettings,
} from "@/lib/crm/telegram-updates";
import {
  countGoogleReviewsToMatch,
  countSignUps,
  loadWeeklySummaryCounts,
} from "@/lib/crm/telegram-update-sources";

type Send = (text: string) => Promise<TelegramStatus>;

export async function readTelegramUpdates(
  admin: SupabaseClient = supabaseAdmin(),
): Promise<TelegramUpdatesSettings> {
  const { data, error } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", CRM_TELEGRAM_UPDATES_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseTelegramUpdates((data as { value?: string } | null)?.value);
}

export async function isOnlineResultNoticeOn(): Promise<boolean> {
  try {
    return (await readTelegramUpdates()).online_result_held.enabled;
  } catch {
    return true;
  }
}

export async function claimTelegramPeriod(
  admin: SupabaseClient,
  type: ScheduledTelegramUpdateType,
  period: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", CRM_TELEGRAM_LAST_SENT_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const stored = (data as { value?: string } | null)?.value ?? null;
    const step = nextLastSent(stored, type, period);
    if (!step.claim) return false;
    const updated_at = new Date().toISOString();

    if (stored === null) {
      const { error: insertErr } = await admin
        .from("site_settings")
        .insert({ key: CRM_TELEGRAM_LAST_SENT_KEY, value: step.next, updated_at });
      if (!insertErr) return true;
      if (insertErr.code === "23505") continue;
      throw new Error(insertErr.message);
    }

    const { data: moved, error: updateErr } = await admin
      .from("site_settings")
      .update({ value: step.next, updated_at })
      .eq("key", CRM_TELEGRAM_LAST_SENT_KEY)
      .eq("value", stored)
      .select("key");
    if (updateErr) throw new Error(updateErr.message);
    if (moved?.length) return true;
  }
  throw new Error("crm_telegram_last_sent kept changing; nothing claimed");
}

export type ScheduledOutcome =
  | { status: "sent"; period: string }
  | { status: "failed"; period: string }
  | { status: "off" }
  | { status: "not_due" }
  | { status: "not_built" }
  | { status: "none" }
  | { status: "already_sent"; period: string }
  | { status: "error"; error: string };

export type CrmTelegramRunSummary =
  | { ok: true; skipped: "no bot token" }
  | { ok: false; error: string }
  | ({ ok: true } & Record<ScheduledTelegramUpdateType, ScheduledOutcome>);

export async function runCrmTelegramUpdates(
  admin: SupabaseClient,
  opts: { origin: string; now?: Date; send?: Send },
): Promise<CrmTelegramRunSummary> {
  if (!opts.send && !process.env.TELEGRAM_BOT_TOKEN?.trim()) return { ok: true, skipped: "no bot token" };
  const send = opts.send ?? sendTelegram;
  const now = opts.now ?? new Date();

  let settings: TelegramUpdatesSettings;
  try {
    settings = await readTelegramUpdates(admin);
  } catch (e) {
    return { ok: false, error: `settings unreadable: ${e instanceof Error ? e.message : "failed"}` };
  }

  const post = async (type: ScheduledTelegramUpdateType, text: string): Promise<ScheduledOutcome> => {
    const period = periodFor(type, now);
    if (!(await claimTelegramPeriod(admin, type, period))) return { status: "already_sent", period };
    return (await send(text)) === "sent" ? { status: "sent", period } : { status: "failed", period };
  };

  const run = async (type: ScheduledTelegramUpdateType, fn: () => Promise<ScheduledOutcome>) => {
    if (!settings[type].enabled) return { status: "off" } as const;
    try {
      return await fn();
    } catch (e) {
      return { status: "error", error: e instanceof Error ? e.message : "failed" } as const;
    }
  };

  const google_reviews_to_match = await run("google_reviews_to_match", async () => {
    const count = await countGoogleReviewsToMatch(admin);
    if (count === null) return { status: "not_built" };
    if (count <= 0) return { status: "none" };
    return post("google_reviews_to_match", renderGoogleReviewsToMatch(count, opts.origin));
  });

  const new_sign_ups = await run("new_sign_ups", async () => {
    const counts = await countSignUps(admin, previousSgtDay(now));
    if (counts === null) return { status: "not_built" };
    if (counts.total <= 0) return { status: "none" };
    return post("new_sign_ups", renderNewSignUps(counts, opts.origin));
  });

  const weekly_summary = await run("weekly_summary", async () => {
    if (sgtWeekday(now) !== settings.weekly_summary.day) return { status: "not_due" };
    const counts = await loadWeeklySummaryCounts(admin, previousSgtWeek(now));
    return post("weekly_summary", renderWeeklySummary(counts, opts.origin));
  });

  return { ok: true, google_reviews_to_match, new_sign_ups, weekly_summary };
}

export type TelegramTestResult = {
  ok: boolean;
  sent: TelegramUpdateType[];
  failed: TelegramUpdateType[];
  telegram?: "skipped";
};

export async function sendTelegramUpdatesTest(
  settings: TelegramUpdatesSettings,
  opts: { origin: string; send?: Send },
): Promise<TelegramTestResult> {
  const send = opts.send ?? sendTelegram;
  const result: TelegramTestResult = { ok: true, sent: [], failed: [] };
  for (const type of TELEGRAM_UPDATE_TYPES) {
    if (!settings[type].enabled) continue;
    const status = await send(renderTelegramUpdateTest(type, opts.origin));
    if (status === "skipped") return { ok: false, sent: [], failed: [], telegram: "skipped" };
    if (status === "sent") result.sent.push(type);
    else result.failed.push(type);
  }
  result.ok = result.failed.length === 0;
  return result;
}
