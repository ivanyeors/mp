/**
 * The Review request on the Customer timeline (CRM slice 07, through slice
 * 03's read-time merge, ADR 0027 b). Two entries at most, since a Customer is
 * asked once: *Review requested (email, WhatsApp)*, then *Review link clicked*.
 *
 * Pure. The adapter that reads the rows is
 * lib/crm/timeline/sources/review-requests.ts.
 *
 * A click is a hint, never proof of a review: mail scanners prefetch links.
 */

import type { TimelineEntry } from "@/lib/crm/timeline/types";

export const REVIEW_REQUEST_TIMELINE_KINDS = ["review_request.sent", "review_request.clicked"] as const;

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
export function reviewRequestTimelineEntries(rows: ReviewRequestTimelineRows): TimelineEntry[] {
  const { request } = rows;
  if (!request) return [];
  const ref = { type: "review_request", id: request.customer_id };

  const sent = rows.sends
    .filter((s) => s.status === "sent" && s.sent_at)
    .sort((a, b) => ms(a.sent_at!) - ms(b.sent_at!));
  const channels = (["email", "whatsapp"] as const).filter((c) => sent.some((s) => s.channel === c));
  const sentId = `review_request.sent:${request.customer_id}`;
  const entries: TimelineEntry[] = [
    channels.length > 0
      ? {
          id: sentId,
          // "Asked on" is the earlier of the two sends (slice 12).
          at: sent[0].sent_at!,
          kind: "review_request.sent",
          ref,
          summary: `Review requested (${channels.map((c) => CHANNEL_LABEL[c]).join(", ")})`,
        }
      : {
          id: sentId,
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
      id: `review_request.clicked:${request.customer_id}`,
      at: request.first_clicked_at,
      kind: "review_request.clicked",
      ref,
      summary: n > 1 ? `Review link clicked (${n} times)` : "Review link clicked",
    });
  }
  return entries.sort((a, b) => ms(b.at) - ms(a.at) || a.kind.localeCompare(b.kind));
}
