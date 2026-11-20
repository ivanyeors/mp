import { accountAdapter } from "@/lib/crm/timeline/sources/account";
import { aftercareAdapter } from "@/lib/crm/timeline/sources/aftercare";
import { campaignSendsAdapter } from "@/lib/crm/timeline/sources/campaign-sends";
import { checkupsAdapter } from "@/lib/crm/timeline/sources/checkups";
import { claimLinksAdapter } from "@/lib/crm/timeline/sources/claim-links";
import { consentAdapter } from "@/lib/crm/timeline/sources/consent";
import { fittingsAdapter } from "@/lib/crm/timeline/sources/fittings";
import { followUpsAdapter } from "@/lib/crm/timeline/sources/followups";
import { googleReviewsAdapter } from "@/lib/crm/timeline/sources/google-reviews";
import { notesAdapter } from "@/lib/crm/timeline/sources/notes";
import { orderEmailsAdapter, ordersAdapter } from "@/lib/crm/timeline/sources/orders";
import { readjustmentsAdapter } from "@/lib/crm/timeline/sources/readjustments";
import { resultsAdapter } from "@/lib/crm/timeline/sources/results";
import { returnsAdapter } from "@/lib/crm/timeline/sources/returns";
import { reviewRequestsAdapter } from "@/lib/crm/timeline/sources/review-requests";
import { reviewsAdapter } from "@/lib/crm/timeline/sources/reviews";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

export const TIMELINE_ADAPTERS: readonly TimelineAdapter[] = [
  ordersAdapter,
  orderEmailsAdapter,
  resultsAdapter,
  fittingsAdapter,
  readjustmentsAdapter,
  returnsAdapter,
  reviewsAdapter,
  googleReviewsAdapter,
  reviewRequestsAdapter,
  aftercareAdapter,
  checkupsAdapter,
  consentAdapter,
  campaignSendsAdapter,
  accountAdapter,
  claimLinksAdapter,
  notesAdapter,
  followUpsAdapter,
];
