import type { SupabaseClient } from "@supabase/supabase-js";
import { countReviewRequests } from "@/lib/aftercare/review-request-counts";
import { countGoogleReviewsLinked, countReviewsToMatch } from "@/lib/crm/google-review-match-server";
import { sgtDay, type CountWindow, type SignUpCounts, type WeeklySummaryCounts } from "@/lib/crm/telegram-updates";

export async function countGoogleReviewsToMatch(admin: SupabaseClient): Promise<number | null> {
  return countReviewsToMatch(admin);
}

export async function countSignUps(
  admin: SupabaseClient,
  window: CountWindow,
): Promise<SignUpCounts | null> {
  const signedUp = () =>
    admin
      .from("admin_customer_overview")
      .select("id", { count: "exact", head: true })
      .gte("account_linked_at", window.from)
      .lt("account_linked_at", window.to);
  const [total, migrated] = await Promise.all([signedUp(), signedUp().eq("from_shopify", true)]);
  if (total.error) throw new Error(`admin_customer_overview: ${total.error.message}`);
  if (migrated.error) throw new Error(`admin_customer_overview: ${migrated.error.message}`);
  return { total: total.count ?? 0, migrated: migrated.count ?? 0 };
}

export async function countNewCustomers(admin: SupabaseClient, window: CountWindow): Promise<number> {
  const { count, error } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .gte("created_at", window.from)
    .lt("created_at", window.to);
  if (error) throw new Error(`customers: ${error.message}`);
  return count ?? 0;
}

export async function countFollowUps(
  admin: SupabaseClient,
  week: CountWindow,
): Promise<{ done: number; overdue: number }> {
  const count = () => admin.from("customer_followups").select("id", { count: "exact", head: true });
  const closedOn = sgtDay(new Date(week.to));
  const [done, stillOpen, doneLater] = await Promise.all([
    count().gte("done_at", week.from).lt("done_at", week.to),
    count().lt("due_on", closedOn).is("done_at", null),
    count().lt("due_on", closedOn).gte("done_at", week.to),
  ]);
  for (const res of [done, stillOpen, doneLater]) {
    if (res.error) throw new Error(`customer_followups: ${res.error.message}`);
  }
  return { done: done.count ?? 0, overdue: (stillOpen.count ?? 0) + (doneLater.count ?? 0) };
}

export type WeeklySummarySource = (
  admin: SupabaseClient,
  week: CountWindow,
) => Promise<Partial<WeeklySummaryCounts>>;

export const WEEKLY_SUMMARY_SOURCES: readonly WeeklySummarySource[] = [
  async (admin, week) => ({ newCustomers: await countNewCustomers(admin, week) }),
  async (admin, week) => {
    const signUps = await countSignUps(admin, week);
    return signUps ? { signUps: signUps.total } : {};
  },
  async (admin, week) => {
    const reviewRequests = await countReviewRequests(admin, week);
    return reviewRequests.sent > 0 ? { reviewRequests } : {};
  },
  async (admin, week) => ({ followUps: await countFollowUps(admin, week) }),
  async (admin, week) => {
    const googleReviewsLinked = await countGoogleReviewsLinked(admin, week);
    return googleReviewsLinked > 0 ? { googleReviewsLinked } : {};
  },
];

export async function loadWeeklySummaryCounts(
  admin: SupabaseClient,
  week: CountWindow,
  sources: readonly WeeklySummarySource[] = WEEKLY_SUMMARY_SOURCES,
): Promise<WeeklySummaryCounts> {
  const parts = await Promise.all(sources.map((source) => source(admin, week)));
  return Object.assign({ newCustomers: 0 }, ...parts) as WeeklySummaryCounts;
}
