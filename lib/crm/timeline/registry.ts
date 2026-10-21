import { accountAdapter } from "@/lib/crm/timeline/sources/account";
import { aftercareAdapter } from "@/lib/crm/timeline/sources/aftercare";
import { consentAdapter } from "@/lib/crm/timeline/sources/consent";
import { notesAdapter } from "@/lib/crm/timeline/sources/notes";
import { orderEmailsAdapter, ordersAdapter } from "@/lib/crm/timeline/sources/orders";
import { readjustmentsAdapter } from "@/lib/crm/timeline/sources/readjustments";
import { resultsAdapter } from "@/lib/crm/timeline/sources/results";
import { returnsAdapter } from "@/lib/crm/timeline/sources/returns";
import { reviewRequestsAdapter } from "@/lib/crm/timeline/sources/review-requests";
import { reviewsAdapter } from "@/lib/crm/timeline/sources/reviews";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

/**
 * Every source on the Customer timeline (ADR 0027 (b)), in filter-chip order.
 * The timeline is merged when it is read from the tables that already record
 * each fact: nothing is copied, so a new source needs no backfill.
 *
 * HOW TO ADD A SOURCE (still to come: CRM 06 follow-ups, 08 check-ups,
 * 12 reviews; migration 08 campaign sends):
 *
 * 1. Write `sources/<name>.ts` exporting one `TimelineAdapter`:
 *    - `group`: one from `groups.ts`, or a new one added there (a new chip);
 *    - `kinds`: its own, `"<thing>.<what happened>"`, e.g. `"follow_up.done"`;
 *    - `permission`: the key of the page that owns the source table. The route
 *      runs the adapter only for a viewer holding it, so its kinds never reach
 *      anyone else. Customer-only facts use `customers`;
 *    - `load(customer, before, limit)`: one bounded read per dated column, with
 *      `readStream` (`read.ts`): the newest `limit` rows at or before `before`.
 *      Each entry's `at` is a time the table stored. Never derive one: a status
 *      with no time of its own goes in `status`, the pill. `ref.href` is the
 *      record's Admin Panel page; the route drops it for a viewer without that
 *      page's permission. Several streams become one batch with `joinBatches`.
 * 2. Add it to the list below.
 * 3. Test it through the route (`app/api/settings/customers/__tests__/
 *    timeline-route.test.ts` shows the fixture and the permission checks).
 *
 * Nothing else changes: not the merge, the route or the card.
 */
export const TIMELINE_ADAPTERS: readonly TimelineAdapter[] = [
  ordersAdapter,
  orderEmailsAdapter,
  resultsAdapter,
  readjustmentsAdapter,
  returnsAdapter,
  reviewsAdapter,
  reviewRequestsAdapter,
  aftercareAdapter,
  consentAdapter,
  accountAdapter,
  notesAdapter,
];
