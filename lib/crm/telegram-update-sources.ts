import type { SupabaseClient } from "@supabase/supabase-js";
import { countReviewRequests } from "@/lib/aftercare/review-request-counts";
import type { CountWindow, SignUpCounts, WeeklySummaryCounts } from "@/lib/crm/telegram-updates";

/**
 * Where the scheduled Telegram updates get their numbers (CRM slice 14).
 *
 * Every function here returns a count and never a row: nothing that names a
 * customer leaves this file, so nothing that names one can reach the Staff
 * group (README, third hazard). Each query uses `head: true`.
 *
 * One source does not exist yet. Its function is the seam the owning slice
 * fills, and until then returns `null`, which the job reports as `not_built`
 * and posts nothing for:
 *
 *  - {@link countGoogleReviewsToMatch} — CRM slice 12 (`customer_google_reviews`).
 *
 * {@link countSignUps} was the other seam; migration slice 12 filled it
 * (`account_linked_at` on the Customer overview). It also feeds the Weekly
 * summary's sign-ups line.
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
 * Migration slice 12. Customers whose `account_linked_at` falls in `window`,
 * and how many of them are **Migrated customers** (`from_shopify`). Used for
 * yesterday (New sign-ups) and the previous week (Weekly summary).
 *
 * Both are `head: true` counts on the Customer overview, where the statuses
 * are derived. `account_linked_at` is stamped only when a login is bound, so
 * the import itself never counts: a row it created counts on the day its owner
 * first signs in (their Claim), which is a sign-up the migration wants to see.
 * Backfilled dates are the logins' creation dates, so the migration that added
 * the column causes no spike. Never null now that the column exists; the type
 * keeps the seam's contract with the job.
 */
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
 *  - CRM slice 07's `reviewRequests` (`customer_review_requests`: asked in the
 *    week, and how many of those have `first_clicked_at` set) is in;
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
  // CRM slice 07: Customers asked in the week, and how many of them opened the
  // link. No line in a week nobody was asked, such as while it is switched off.
  async (admin, week) => {
    const reviewRequests = await countReviewRequests(admin, week);
    return reviewRequests.sent > 0 ? { reviewRequests } : {};
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
