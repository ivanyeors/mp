"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { readDropOffSummary, SUMMARY_DAYS, type SummaryDays } from "@/lib/analytics/drop-off/store";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function getDropOffReasons(days: number) {
  await assertAdmin("analytics");
  const window: SummaryDays = (SUMMARY_DAYS as readonly number[]).includes(days) ? (days as SummaryDays) : 30;
  return readDropOffSummary(supabaseAdmin(), { days: window });
}
