import type { SupabaseClient } from "@supabase/supabase-js";
import { countReviewRequests } from "@/lib/aftercare/review-request-counts";
import { countGoogleReviewsLinked, countReviewsToMatch } from "@/lib/crm/google-review-match-server";
import { sgtDay, type CountWindow, type SignUpCounts, type WeeklySummaryCounts } from "@/lib/crm/telegram-updates";

/**
 * Where the scheduled Telegram updates get their numbers (CRM slice 14).
 *
 * Every function here returns a count and never a row: nothing that names a
 * customer leaves this file, so nothing that names one can reach the Staff
 * group (README, third hazard). Each query uses `head: true`, except the
 * Google reviews to match, which are counted after their suggestions are
 * computed (CRM slice 12) and leave as a number.
 *
 * Both seams are filled: {@link countGoogleReviewsToMatch} by CRM slice 12,
 * and {@link countSignUps} by migration slice 12 (`account_linked_at` on the
 * Customer overview), which also feeds the Weekly summary's sign-ups line. A
 * seam's `null` ("not built") stays in the types for the job's contract.
 */

/**
 * CRM slice 12. The reviews waiting in *Google reviews to match* on Customers
 * → Reviews: unlinked Google reviews with at least one suggested Customer.
 * Reviews with no suggestion (anonymous, or from someone we never asked) are
 * on that tab's *All unlinked* list and are not counted, so the daily update
 * asks only for what Staff can act on. Until the Google review sync is live
 * the count is zero, so nothing posts.
 */
export async function countGoogleReviewsToMatch(admin: SupabaseClient): Promise<number | null> {
  return countReviewsToMatch(admin);
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
 * CRM slice 06. Follow-ups done in `week`, and how many were overdue as it
 * closed: open at its end (not done, or done after it) and due before its
 * last day's midnight, the Monday the default summary posts on. A snapshot at
 * the week's edge, so a re-run on another day reports the same week the same
 * way. Counts only: a follow-up's title and its Customer never leave here.
 */
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

/**
 * One line of the Weekly summary: the counts its source contributes for the
 * week, or nothing while the source does not exist. Like a timeline adapter,
 * each source is added by the slice that owns it, and the renderer
 * (`renderWeeklySummary`) already knows its wording:
 *
 *  - CRM slice 07's `reviewRequests` (`customer_review_requests`: asked in the
 *    week, and how many of those have `first_clicked_at` set) is in;
 *  - CRM slice 12's `googleReviewsLinked` (`customer_google_reviews.linked_at`
 *    in the week) is in;
 *  - CRM slice 06 added `followUps` ({@link countFollowUps}).
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
  // CRM slice 06: follow-ups done in the week, and overdue as it closed.
  async (admin, week) => ({ followUps: await countFollowUps(admin, week) }),
  // CRM slice 12: Google reviews Staff linked to a Customer in the week. No
  // line in a week with none, such as before the Google review sync is live.
  async (admin, week) => {
    const googleReviewsLinked = await countGoogleReviewsLinked(admin, week);
    return googleReviewsLinked > 0 ? { googleReviewsLinked } : {};
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
