import type { SupabaseClient } from "@supabase/supabase-js";
import { countLinkedReviewsOfAsked } from "@/lib/crm/google-review-match-server";
import { REVIEW_REQUEST_TEMPLATE } from "./review-request";

export type ReviewRequestWindow = { from: string; to: string };

async function count(
  label: string,
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return n ?? 0;
}

export async function countReviewRequests(
  admin: SupabaseClient,
  window: ReviewRequestWindow,
): Promise<{ sent: number; opened: number }> {
  const { data, error } = await admin
    .from("customer_review_requests")
    .select("first_clicked_at")
    .gte("created_at", window.from)
    .lt("created_at", window.to);
  if (error) throw new Error(`customer_review_requests: ${error.message}`);
  const rows = (data ?? []) as Array<{ first_clicked_at: string | null }>;
  return { sent: rows.length, opened: rows.filter((r) => r.first_clicked_at != null).length };
}

export async function countReviewRequestSends(
  admin: SupabaseClient,
  window: ReviewRequestWindow,
): Promise<{ email: number; whatsapp: number }> {
  const sent = (table: "customer_emails" | "customer_whatsapp") =>
    admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("template", REVIEW_REQUEST_TEMPLATE)
      .eq("status", "sent")
      .gte("sent_at", window.from)
      .lt("sent_at", window.to);
  const [email, whatsapp] = await Promise.all([
    count("customer_emails", sent("customer_emails")),
    count("customer_whatsapp", sent("customer_whatsapp")),
  ]);
  return { email, whatsapp };
}

export async function countLinkedGoogleReviewsOfRequested(admin: SupabaseClient): Promise<number> {
  return countLinkedReviewsOfAsked(admin);
}
