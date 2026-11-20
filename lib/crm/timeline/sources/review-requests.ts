import { supabaseAdmin } from "@/lib/supabase/server";
import { REVIEW_REQUEST_TEMPLATE } from "@/lib/aftercare/review-request";
import {
  REVIEW_REQUEST_TIMELINE_KINDS,
  reviewRequestTimelineEntries,
  type ReviewRequestTimelineRows,
} from "@/lib/aftercare/review-request-timeline";
import { REVIEWS_GROUP } from "@/lib/crm/timeline/groups";
import { cappedBatch } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

type Send = { status: string; sent_at: string | null };

export const reviewRequestsAdapter: TimelineAdapter = {
  key: "review_requests",
  group: REVIEWS_GROUP,
  kinds: REVIEW_REQUEST_TIMELINE_KINDS,
  permission: "customers",
  async load(customer, before) {
    const admin = supabaseAdmin();
    const ledger = (table: "customer_emails" | "customer_whatsapp") =>
      admin
        .from(table)
        .select("status, sent_at")
        .eq("customer_id", customer.id)
        .eq("template", REVIEW_REQUEST_TEMPLATE)
        .eq("entity_id", customer.id);
    const [request, emails, whatsapp] = await Promise.all([
      admin
        .from("customer_review_requests")
        .select("customer_id, created_at, first_clicked_at, click_count")
        .eq("customer_id", customer.id)
        .maybeSingle(),
      ledger("customer_emails"),
      ledger("customer_whatsapp"),
    ]);
    const failed = request.error ?? emails.error ?? whatsapp.error;
    if (failed) throw new Error(failed.message);
    if (!request.data) return { entries: [], floor: null };

    const entries = reviewRequestTimelineEntries({
      request: request.data as ReviewRequestTimelineRows["request"],
      sends: [
        ...((emails.data ?? []) as Send[]).map((s) => ({ ...s, channel: "email" as const })),
        ...((whatsapp.data ?? []) as Send[]).map((s) => ({ ...s, channel: "whatsapp" as const })),
      ],
    });
    return cappedBatch(entries, before, null);
  },
};
