import type { SupabaseClient } from "@supabase/supabase-js";
import type { CountWindow, SignUpCounts, WeeklySummaryCounts } from "@/lib/crm/telegram-updates";

/**
 * Where the scheduled Telegram updates get their numbers (CRM slice 14).
 *
 * Every function here returns a count and never a row: nothing that names a
 * customer leaves this file, so nothing that names one can reach the Staff
 * group (README, third hazard). Each query uses `head: true`.
 *
 * Two sources do not exist yet. Their functions are the seams the owning slices
 * fill, and until then return `null`, which the job reports as `not_built` and
 * posts nothing for:
 *
 *  - {@link countGoogleReviewsToMatch} — CRM slice 12 (`customer_google_reviews`).
 *  - {@link countSignUps} — migration slice 12 (`customers.account_linked_at`,
 *    `migrated_customers`). It also feeds the Weekly summary's sign-ups line.
 */

/**
 * SEAM — CRM slice 12. The reviews waiting in its *Google reviews to match*
 * list: `google_reviews` rows with no `customer_google_reviews` link.
 *
 * Returns null until that table exists. Slice 12 replaces the body with its
 * own count, and the Daily *Google reviews to match* update starts posting
 * with no other change. Until the Google review sync is live the count is zero,
 * so nothing posts either way.
 */
export async function countGoogleReviewsToMatch(admin: SupabaseClient): Promise<number | null> {
  void admin;
  return null;
}

/**
 * SEAM — migration slice 12. Customers whose `account_linked_at` falls in
 * `window`, and how many of them are **Migrated customers** (a
 * `migrated_customers` row). Used for yesterday (New sign-ups) and the
 * previous week (Weekly summary).
 *
 * Returns null until `account_linked_at` exists. Migration slice 12 replaces the
 * body with two `head: true` counts, for example:
 *
 *   customers.select("id", { count: "exact", head: true })
 *     .gte("account_linked_at", window.from).lt("account_linked_at", window.to)
 *
 * and the same joined to `migrated_customers!inner`.
 */
export async function countSignUps(
  admin: SupabaseClient,
  window: CountWindow,
): Promise<SignUpCounts | null> {
  void admin;
  void window;
  return null;
}

/** Customers created in `window`. */
export async function countNewCustomers(admin: SupabaseClient, window: CountWindow): Promise<number> {
  const { count, error } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .gte("created_at", window.from)
    .lt("created_at", window.to);
  if (error) throw new Error(`customers: ${error.message}`);
  return count ?? 0;
}

/**
 * One line of the Weekly summary: the counts its source contributes for the
 * week, or nothing while the source does not exist. Like a timeline adapter,
 * each source is added by the slice that owns it, and the renderer
 * (`renderWeeklySummary`) already knows its wording:
 *
 *  - CRM slice 07 adds `reviewRequests` (`customer_review_requests`: sent, and
 *    `first_clicked_at` set);
 *  - CRM slice 12 adds `googleReviewsLinked` (`customer_google_reviews.linked_at`);
 *  - CRM slice 06 adds `followUps` (`customer_followups`: done in the week, and
 *    overdue now).
 */
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
];

/** Every source's counts for `week`, merged. */
export async function loadWeeklySummaryCounts(
  admin: SupabaseClient,
  week: CountWindow,
  sources: readonly WeeklySummarySource[] = WEEKLY_SUMMARY_SOURCES,
): Promise<WeeklySummaryCounts> {
  const parts = await Promise.all(sources.map((source) => source(admin, week)));
  return Object.assign({ newCustomers: 0 }, ...parts) as WeeklySummaryCounts;
}
