import type { InlineKeyboardMarkup } from "@/lib/telegram/bot-api";
import type { GoogleReviewRow } from "@/lib/reviews/google-reviews";
import { replyWarnings } from "@/lib/reviews/reply-rules";
import { REPLY_STYLE_NAMES, replyStyleFor } from "@/lib/reviews/reply-style";

/**
 * Telegram cards for reviews. Pure: given a row, the text and buttons a card
 * should show right now. Every state change re-renders the whole card, so a
 * card never shows buttons for an action that no longer applies.
 *
 * The first line names the source in capitals so nobody mistakes a public
 * Google review (we reply on Google Maps) for a website review (no reply;
 * approve or reject only). Plain text — no parse_mode, nothing to escape.
 */

export const GOOGLE_CARD_HEADER = "⭐ GOOGLE MAPS REVIEW";
export const SHOP_CARD_HEADER = "🛍 SHOP REVIEW · mpillow website";

const MAX_REVIEW_CHARS = 1200;

export type Card = { text: string; replyMarkup?: InlineKeyboardMarkup };

// ---------------------------------------------------------------------------
// Callback data: rv:<source>:<action>:<id>[:<draft version>] — at most 52 bytes,
// inside Telegram's 64. Post carries the draft version the tapper was looking
// at, so a draft edited a moment earlier is never published unseen.
// ---------------------------------------------------------------------------

export const REVIEW_CALLBACK_PREFIX = "rv:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewCallback =
  | { source: "google"; action: "post"; id: string; version: number }
  | { source: "google"; action: "redraft" | "skip"; id: string }
  | { source: "shop"; action: "approve" | "reject"; id: string };

export function encodeReviewCallback(cb: ReviewCallback): string {
  if (cb.source === "google") {
    return cb.action === "post" ? `rv:g:post:${cb.id}:${cb.version}` : `rv:g:${cb.action}:${cb.id}`;
  }
  return `rv:s:${cb.action}:${cb.id}`;
}

export function parseReviewCallback(data: string): ReviewCallback | null {
  const parts = data.split(":");
  if (parts[0] !== "rv" || !UUID.test(parts[3] ?? "")) return null;
  const [, source, action, id, version] = parts;
  if (source === "g") {
    if (action === "post" && parts.length === 5 && /^\d{1,6}$/.test(version ?? "")) {
      return { source: "google", action: "post", id, version: Number(version) };
    }
    if ((action === "redraft" || action === "skip") && parts.length === 4) {
      return { source: "google", action, id };
    }
  }
  if (source === "s" && (action === "approve" || action === "reject") && parts.length === 4) {
    return { source: "shop", action, id };
  }
  return null;
}

// ---------------------------------------------------------------------------

export function starLine(rating: number | null): string {
  if (!rating) return "No star rating";
  const n = Math.max(1, Math.min(5, Math.round(rating)));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)} ${n}/5`;
}

export function formatCardDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function quoted(text: string | null | undefined, empty: string): string {
  const t = text?.trim();
  return t ? `“${clip(t, MAX_REVIEW_CHARS)}”` : empty;
}

function reviewerLabel(row: Pick<GoogleReviewRow, "reviewer_name" | "reviewer_is_anonymous">): string {
  if (row.reviewer_is_anonymous || !row.reviewer_name?.trim()) return "A Google user";
  return row.reviewer_name.trim();
}

/** A reviewer edit shows when Google's update time is well after creation. */
function editedLine(row: GoogleReviewRow): string | null {
  if (!row.review_created_at || !row.review_updated_at) return null;
  const created = new Date(row.review_created_at).getTime();
  const updated = new Date(row.review_updated_at).getTime();
  if (!(updated - created > 60_000)) return null;
  return `✏️ Edited by the reviewer · ${formatCardDate(row.review_updated_at)}`;
}

const SETTLED: GoogleReviewRow["status"][] = ["posting", "posted", "skipped", "replied_elsewhere"];

export function renderGoogleReviewCard(row: GoogleReviewRow): Card {
  const style = replyStyleFor(row.star_rating);
  const lines: string[] = [
    GOOGLE_CARD_HEADER,
    `${starLine(row.star_rating)} · ${reviewerLabel(row)}`,
  ];
  // A 1–2★ review is a customer to win back, not just a reply to post.
  if (style === "service_recovery" && !SETTLED.includes(row.status)) {
    lines.push("🛟 SERVICE RECOVERY — reply soon, and follow up with this customer personally if you can identify them.");
  }
  const posted = formatCardDate(row.review_created_at);
  if (posted) lines.push(`Posted ${posted}`);
  lines.push("", quoted(row.comment, "(Rating only — no written review)"));
  const edited = editedLine(row);
  if (edited) lines.push(edited);
  lines.push("");

  switch (row.status) {
    case "posting":
      lines.push("⏳ Posting the reply to Google Maps…");
      return { text: lines.join("\n") };

    case "posted": {
      const by = row.acted_by_name ? ` by ${row.acted_by_name}` : "";
      const at = formatCardDate(row.posted_at);
      lines.push(`✅ Replied on Google Maps${by}${at ? ` · ${at}` : ""}`, row.posted_reply ?? "");
      return { text: lines.join("\n").trimEnd() };
    }

    case "skipped":
      lines.push(`🙈 Skipped${row.acted_by_name ? ` by ${row.acted_by_name}` : ""} — no reply posted.`);
      return { text: lines.join("\n") };

    case "replied_elsewhere":
      lines.push("↪️ Already answered directly on Google:", row.google_reply ?? "");
      return { text: lines.join("\n").trimEnd() };

    default:
      break;
  }

  // new / pending / backlog: waiting on a review manager.
  if (row.draft_reply) {
    const heading =
      row.draft_source === "staff"
        ? `✍️ Reply written by ${row.acted_by_name ?? "a review manager"}:`
        : `✍️ ${REPLY_STYLE_NAMES[style]} reply, drafted by Claude:`;
    lines.push(heading, row.draft_reply);
    for (const warning of replyWarnings(row.draft_reply)) lines.push(`⚠️ ${warning}`);
  } else {
    lines.push(`✍️ No draft yet${row.draft_error ? ` — ${row.draft_error}` : ""}.`);
  }
  if (row.last_error) lines.push(`❌ Last attempt failed: ${row.last_error}`);
  lines.push(
    "",
    row.draft_reply
      ? "👉 Review managers: tap Post to publish this reply on Google Maps, or reply to this message with your own wording to replace the draft."
      : "👉 Review managers: reply to this message with the wording to post, or tap Redraft.",
  );

  const buttons = [
    ...(row.draft_reply
      ? [
          {
            text: "✅ Post reply",
            callback_data: encodeReviewCallback({
              source: "google",
              action: "post",
              id: row.id,
              version: row.draft_version,
            }),
          },
        ]
      : []),
    { text: "🔁 Redraft", callback_data: encodeReviewCallback({ source: "google", action: "redraft", id: row.id }) },
    { text: "🙈 Skip", callback_data: encodeReviewCallback({ source: "google", action: "skip", id: row.id }) },
  ];
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: [buttons] } };
}

// ---------------------------------------------------------------------------

export type ShopReviewForCard = {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string | null;
  productName: string | null;
};

export function renderShopReviewCard(review: ShopReviewForCard, actedBy?: string | null): Card {
  const lines: string[] = [SHOP_CARD_HEADER, `${starLine(review.rating)} · ${review.author_name}`];
  if (review.productName) lines.push(`Product: ${review.productName}`);
  const posted = formatCardDate(review.created_at);
  if (posted) lines.push(`Posted ${posted}`);
  lines.push("");
  if (review.title?.trim()) lines.push(clip(review.title.trim(), 300));
  lines.push(quoted(review.body, "(Rating only — no written review)"), "");

  const by = actedBy ? ` by ${actedBy}` : "";
  if (review.status === "approved") {
    lines.push(`✅ Approved${by} — shown on the product page.`);
    return { text: lines.join("\n") };
  }
  if (review.status === "rejected") {
    lines.push(`🚫 Rejected${by} — hidden from the shop.`);
    return { text: lines.join("\n") };
  }
  lines.push("👉 Approve to show it on the product page, or reject to keep it hidden. Shop reviews get no public reply.");
  return {
    text: lines.join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: encodeReviewCallback({ source: "shop", action: "approve", id: review.id }) },
          { text: "🚫 Reject", callback_data: encodeReviewCallback({ source: "shop", action: "reject", id: review.id }) },
        ],
      ],
    },
  };
}
