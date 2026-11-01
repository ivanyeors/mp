"use server";

import { assertAdmin } from "@/lib/auth/admin";
import {
  readUnsubscribeSummary,
  UNSUBSCRIBE_SUMMARY_DAYS,
  type UnsubscribeSummaryDays,
} from "@/lib/marketing-consent/unsubscribe-reasons-server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * *Why people unsubscribe* (PRD-crm-retention-loop slice 11): every
 * unsubscribe of the last 30, 90 or 365 days and the answers given. Guarded by
 * `analytics`; any other window reads 30 days.
 */
export async function getUnsubscribeReasons(days: number) {
  await assertAdmin("analytics");
  const window: UnsubscribeSummaryDays = (UNSUBSCRIBE_SUMMARY_DAYS as readonly number[]).includes(days)
    ? (days as UnsubscribeSummaryDays)
    : 30;
  return readUnsubscribeSummary(supabaseAdmin(), { days: window });
}
