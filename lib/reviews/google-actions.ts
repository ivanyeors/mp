import { supabaseAdmin } from "@/lib/supabase/server";
import {
  BusinessProfileError,
  businessProfileClientFromConfig,
  getBusinessProfileConfig,
  type BusinessProfileClient,
} from "@/lib/google/business-profile";
import { draftReviewReply } from "@/lib/reviews/draft-reply";
import { checkReplyText } from "@/lib/reviews/reply-rules";
import {
  GOOGLE_REVIEW_COLUMNS,
  getGoogleReview,
  type GoogleReviewRow,
} from "@/lib/reviews/google-reviews";

/**
 * What a review manager can do to a Google review card: post the current
 * draft, redraft it with Claude, replace it with their own words, or skip.
 *
 * Every write is a guarded update on `status` (and on `draft_version` where
 * the draft matters), so two people tapping at once cannot both act, and a
 * Post never publishes a draft the tapper had not seen.
 */

export type Actor = { telegramUserId: number; name: string };

export type ActionFailure = {
  ok: false;
  reason: "not_found" | "not_pending" | "stale" | "invalid" | "not_configured" | "google_error";
  message: string;
  row?: GoogleReviewRow;
};

function actorFields(actor: Actor) {
  return { acted_by_telegram_user_id: actor.telegramUserId, acted_by_name: actor.name };
}

async function explainMiss(id: string, expectedVersion?: number): Promise<ActionFailure> {
  const row = await getGoogleReview(id);
  if (!row) return { ok: false, reason: "not_found", message: "This review is no longer in the inbox." };
  if (row.status !== "pending") {
    return { ok: false, reason: "not_pending", message: "Someone already dealt with this review.", row };
  }
  if (expectedVersion !== undefined && row.draft_version !== expectedVersion) {
    return { ok: false, reason: "stale", message: "The draft just changed — check the updated card first.", row };
  }
  if (!row.draft_reply) return { ok: false, reason: "invalid", message: "There is no draft to post yet.", row };
  return { ok: false, reason: "invalid", message: "Nothing changed — try again.", row };
}

/**
 * Step one of Post: claim the row (pending → posting) for the draft version the
 * tapper saw. Cheap and synchronous enough to answer the button tap with.
 */
export async function claimGoogleReviewPost(
  id: string,
  version: number,
  actor: Actor,
): Promise<{ ok: true; row: GoogleReviewRow } | ActionFailure> {
  if (!getBusinessProfileConfig()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Google posting isn't connected yet (GOOGLE_BUSINESS_* settings missing).",
    };
  }
  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update({ status: "posting", last_error: null, ...actorFields(actor) })
    .eq("id", id)
    .eq("status", "pending")
    .eq("draft_version", version)
    .not("draft_reply", "is", null)
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  if (!data) return explainMiss(id, version);
  return { ok: true, row: data as GoogleReviewRow };
}

/** Step two of Post: send the claimed draft to Google and record the outcome. */
export async function executeGoogleReviewPost(
  row: GoogleReviewRow,
  deps: { client?: BusinessProfileClient } = {},
): Promise<{ ok: true; row: GoogleReviewRow } | ActionFailure> {
  const admin = supabaseAdmin();
  const fail = async (reason: ActionFailure["reason"], message: string): Promise<ActionFailure> => {
    const { data } = await admin
      .from("google_reviews")
      .update({ status: "pending", last_error: message })
      .eq("id", row.id)
      .eq("status", "posting")
      .select(GOOGLE_REVIEW_COLUMNS)
      .maybeSingle();
    return { ok: false, reason, message, row: (data as GoogleReviewRow | null) ?? row };
  };

  const checked = checkReplyText(row.draft_reply ?? "");
  if (!checked.ok) return fail("invalid", checked.error);

  const config = deps.client ? null : getBusinessProfileConfig();
  const client = deps.client ?? (config ? businessProfileClientFromConfig(config) : null);
  if (!client) return fail("not_configured", "Google posting isn't connected yet.");

  try {
    const reply = await client.updateReply(row.review_name, checked.text);
    const postedAt = new Date().toISOString();
    const { data } = await admin
      .from("google_reviews")
      .update({
        status: "posted",
        posted_reply: checked.text,
        posted_at: postedAt,
        google_reply: reply.comment,
        google_reply_updated_at: reply.updateTime ?? postedAt,
        last_error: null,
      })
      .eq("id", row.id)
      .select(GOOGLE_REVIEW_COLUMNS)
      .maybeSingle();
    return { ok: true, row: (data as GoogleReviewRow | null) ?? { ...row, status: "posted", posted_reply: checked.text, posted_at: postedAt } };
  } catch (error) {
    const message =
      error instanceof BusinessProfileError || error instanceof Error ? error.message : "Google rejected the reply";
    return fail("google_error", message);
  }
}

/** Ask Claude for a fresh draft. Guarded on the version it replaces. */
export async function redraftGoogleReview(
  id: string,
  actor: Actor,
  deps: { draft?: typeof draftReviewReply } = {},
): Promise<{ ok: true; row: GoogleReviewRow } | ActionFailure> {
  const row = await getGoogleReview(id);
  if (!row) return { ok: false, reason: "not_found", message: "This review is no longer in the inbox." };
  if (row.status !== "pending") {
    return { ok: false, reason: "not_pending", message: "Someone already dealt with this review.", row };
  }

  const draft = deps.draft ?? draftReviewReply;
  const result = await draft({
    starRating: row.star_rating,
    comment: row.comment,
    reviewerName: row.reviewer_name,
    reviewerIsAnonymous: row.reviewer_is_anonymous,
  });
  const patch = result.ok
    ? {
        draft_reply: result.reply,
        draft_source: "claude" as const,
        draft_version: row.draft_version + 1,
        draft_error: null,
        last_error: null,
        ...actorFields(actor),
      }
    : { draft_error: result.error };

  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update(patch)
    .eq("id", id)
    .eq("status", "pending")
    .eq("draft_version", row.draft_version)
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  if (!data) return explainMiss(id, row.draft_version);
  if (!result.ok) {
    return { ok: false, reason: "invalid", message: result.error, row: data as GoogleReviewRow };
  }
  return { ok: true, row: data as GoogleReviewRow };
}

/** A review manager's own wording replaces the draft (and becomes what Post sends). */
export async function setStaffDraft(
  row: GoogleReviewRow,
  text: string,
  actor: Actor,
): Promise<{ ok: true; row: GoogleReviewRow } | ActionFailure> {
  const checked = checkReplyText(text);
  if (!checked.ok) return { ok: false, reason: "invalid", message: checked.error, row };
  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update({
      draft_reply: checked.text,
      draft_source: "staff",
      draft_version: row.draft_version + 1,
      draft_error: null,
      last_error: null,
      ...actorFields(actor),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("draft_version", row.draft_version)
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  if (!data) return explainMiss(row.id, row.draft_version);
  return { ok: true, row: data as GoogleReviewRow };
}

export async function skipGoogleReview(
  id: string,
  actor: Actor,
): Promise<{ ok: true; row: GoogleReviewRow } | ActionFailure> {
  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update({ status: "skipped", ...actorFields(actor) })
    .eq("id", id)
    .eq("status", "pending")
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  if (!data) return explainMiss(id);
  return { ok: true, row: data as GoogleReviewRow };
}
