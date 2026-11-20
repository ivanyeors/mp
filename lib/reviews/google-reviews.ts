import { supabaseAdmin } from "@/lib/supabase/server";

export const GOOGLE_REVIEW_STATUSES = [
  "new",
  "pending",
  "posting",
  "posted",
  "skipped",
  "replied_elsewhere",
  "backlog",
] as const;
export type GoogleReviewStatus = (typeof GOOGLE_REVIEW_STATUSES)[number];

export type GoogleReviewSource = "business_profile" | "places";

export type GoogleReviewRow = {
  id: string;
  review_name: string;
  source: GoogleReviewSource;
  maps_uri: string | null;
  star_rating: number | null;
  comment: string | null;
  reviewer_name: string | null;
  reviewer_is_anonymous: boolean;
  review_created_at: string | null;
  review_updated_at: string | null;
  google_reply: string | null;
  google_reply_updated_at: string | null;
  status: GoogleReviewStatus;
  draft_reply: string | null;
  draft_source: "claude" | "staff" | null;
  draft_version: number;
  draft_error: string | null;
  posted_reply: string | null;
  posted_at: string | null;
  acted_by_telegram_user_id: number | null;
  acted_by_name: string | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  last_error: string | null;
  reopened_at: string | null;
  reopened_from_rating: number | null;
  created_at: string;
  updated_at: string;
};

export const GOOGLE_REVIEW_COLUMNS =
  "id,review_name,source,maps_uri,star_rating,comment,reviewer_name,reviewer_is_anonymous,review_created_at,review_updated_at,google_reply,google_reply_updated_at,status,draft_reply,draft_source,draft_version,draft_error,posted_reply,posted_at,acted_by_telegram_user_id,acted_by_name,telegram_chat_id,telegram_message_id,last_error,reopened_at,reopened_from_rating,created_at,updated_at";

export async function getGoogleReview(id: string): Promise<GoogleReviewRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("google_reviews")
    .select(GOOGLE_REVIEW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GoogleReviewRow | null) ?? null;
}

export async function getGoogleReviewByCard(
  chatId: number,
  messageId: number,
): Promise<GoogleReviewRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("google_reviews")
    .select(GOOGLE_REVIEW_COLUMNS)
    .eq("telegram_chat_id", chatId)
    .eq("telegram_message_id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GoogleReviewRow | null) ?? null;
}
