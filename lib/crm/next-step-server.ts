import type { SupabaseClient } from "@supabase/supabase-js";
import { readAftercareSettings } from "@/lib/aftercare/card-server";
import { marketingEmailState } from "@/lib/marketing-consent/state";
import type { NextStepFacts } from "./next-step";

export async function readNextStepFacts(admin: SupabaseClient, customerId: string, now: Date = new Date()): Promise<NextStepFacts | null> {
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [overview, settings, booked, followUp] = await Promise.all([
    admin
      .from("admin_customer_overview")
      .select("lifecycle_stage, lifecycle_detail, last_delivered_at, review_requested_at, bought, last_readjusted_at, marketing_email, unengaged")
      .eq("id", customerId)
      .maybeSingle(),
    readAftercareSettings(admin),
    admin
      .from("readjustment_bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("status", "booked")
      .gte("start_at", now.toISOString()),
    admin
      .from("customer_followups")
      .select("title, due_on")
      .eq("customer_id", customerId)
      .is("done_at", null)
      .lt("due_on", today)
      .order("due_on", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const r of [overview, booked, followUp]) if (r.error) throw new Error(r.error.message);
  const row = overview.data as Record<string, unknown> | null;
  if (!row) return null;
  const fu = followUp.data as { title: string; due_on: string } | null;
  return {
    stage: row.lifecycle_stage as NextStepFacts["stage"],
    detail: (row.lifecycle_detail as NextStepFacts["detail"]) ?? null,
    lastDeliveredAt: (row.last_delivered_at as string | null) ?? null,
    reviewRequestedAt: (row.review_requested_at as string | null) ?? null,
    reviewRequest: {
      enabled: settings.reviewRequests.enabled,
      daysAfter: settings.reviewRequests.daysAfter,
      maxAgeDays: settings.reviewRequests.maxAgeDays,
    },
    checkup: { enabled: settings.checkups.enabled, months: settings.checkups.months },
    ownsPremium: Array.isArray(row.bought) && row.bought.includes("premium"),
    lastReadjustedAt: (row.last_readjusted_at as string | null) ?? null,
    readjustmentBooked: (booked.count ?? 0) > 0,
    marketingEmail: marketingEmailState(row.marketing_email),
    unengaged: row.unengaged === true,
    overdueFollowUp: fu ? { title: fu.title, dueOn: fu.due_on } : null,
  };
}
