/**
 * The Review request on the Customer timeline (CRM slice 07, for slice 03's
 * read-time merge, ADR 0027 b). Two entries at most, since a Customer is asked
 * once: *Review requested (email, WhatsApp)*, then *Review link clicked*.
 *
 * {@link reviewRequestTimelineEntries} is pure, and shaped like slice 03's
 * `TimelineEntry`. {@link loadReviewRequestTimeline} reads the rows and has the
 * adapter's `load(customer, before, limit)` shape, so registering it is one
 * entry in slice 03's registry, with the `customers` permission.
 *
 * A click is a hint, never proof of a review: mail scanners prefetch links.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { REVIEW_REQUEST_TEMPLATE } from "./review-request";

export const REVIEW_REQUEST_TIMELINE_KINDS = ["review_request.sent", "review_request.clicked"] as const;
export type ReviewRequestTimelineKind = (typeof REVIEW_REQUEST_TIMELINE_KINDS)[number];

export type ReviewRequestTimelineEntry = {
  at: string;
  kind: ReviewRequestTimelineKind;
  ref: { type: string; id: string; href?: string };
  summary: string;
};

export type ReviewRequestTimelineRows = {
  /** The Customer's `customer_review_requests` row, or null when never asked. */
  request: {
    customer_id: string;
    created_at: string;
    first_clicked_at: string | null;
    click_count: number;
  } | null;
  /** Its two ledgers' rows for `aftercare.review_request`. */
  sends: Array<{ channel: "email" | "whatsapp"; status: string; sent_at: string | null }>;
};

const CHANNEL_LABEL = { email: "email", whatsapp: "WhatsApp" } as const;

/** Instants compare as time, whatever offset format the database returned. */
const ms = (iso: string) => Date.parse(iso);

/** The timeline entries for one Customer's review request, newest first. */
export function reviewRequestTimelineEntries(rows: ReviewRequestTimelineRows): ReviewRequestTimelineEntry[] {
  const { request } = rows;
  if (!request) return [];
  const ref = { type: "review_request", id: request.customer_id };

  const sent = rows.sends
    .filter((s) => s.status === "sent" && s.sent_at)
    .sort((a, b) => ms(a.sent_at!) - ms(b.sent_at!));
  const channels = (["email", "whatsapp"] as const).filter((c) => sent.some((s) => s.channel === c));
  const entries: ReviewRequestTimelineEntry[] = [
    channels.length > 0
      ? {
          // "Asked on" is the earlier of the two sends (slice 12).
          at: sent[0].sent_at!,
          kind: "review_request.sent",
          ref,
          summary: `Review requested (${channels.map((c) => CHANNEL_LABEL[c]).join(", ")})`,
        }
      : {
          // Claimed, but nothing delivered yet: a failed email is retried.
          at: request.created_at,
          kind: "review_request.sent",
          ref,
          summary: "Review request not delivered yet",
        },
  ];
  if (request.first_clicked_at) {
    const n = request.click_count;
    entries.push({
      at: request.first_clicked_at,
      kind: "review_request.clicked",
      ref,
      summary: n > 1 ? `Review link clicked (${n} times)` : "Review link clicked",
    });
  }
  return entries.sort((a, b) => ms(b.at) - ms(a.at) || a.kind.localeCompare(b.kind));
}

/**
 * Slice 03's adapter `load`: this Customer's entries older than `before`,
 * newest first, at most `limit`.
 */
export async function loadReviewRequestTimeline(
  admin: SupabaseClient,
  customer: { id: string },
  before: string | null,
  limit: number,
): Promise<ReviewRequestTimelineEntry[]> {
  const [request, emails, whatsapp] = await Promise.all([
    admin
      .from("customer_review_requests")
      .select("customer_id, created_at, first_clicked_at, click_count")
      .eq("customer_id", customer.id)
      .maybeSingle(),
    admin
      .from("customer_emails")
      .select("status, sent_at")
      .eq("customer_id", customer.id)
      .eq("template", REVIEW_REQUEST_TEMPLATE)
      .eq("entity_id", customer.id),
    admin
      .from("customer_whatsapp")
      .select("status, sent_at")
      .eq("customer_id", customer.id)
      .eq("template", REVIEW_REQUEST_TEMPLATE)
      .eq("entity_id", customer.id),
  ]);
  const failed = request.error ?? emails.error ?? whatsapp.error;
  if (failed) throw new Error(`review requests: ${failed.message}`);

  type Send = { status: string; sent_at: string | null };
  const entries = reviewRequestTimelineEntries({
    request: (request.data as ReviewRequestTimelineRows["request"]) ?? null,
    sends: [
      ...((emails.data ?? []) as Send[]).map((s) => ({ ...s, channel: "email" as const })),
      ...((whatsapp.data ?? []) as Send[]).map((s) => ({ ...s, channel: "whatsapp" as const })),
    ],
  });
  return entries.filter((e) => before === null || ms(e.at) < ms(before)).slice(0, limit);
}
