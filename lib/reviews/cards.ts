import type { InlineKeyboardMarkup } from "@/lib/telegram/bot-api";
import type { GoogleReviewRow } from "@/lib/reviews/google-reviews";
import { replyWarnings } from "@/lib/reviews/reply-rules";
import { REPLY_STYLE_NAMES, replyStyleFor } from "@/lib/reviews/reply-style";

/**
 * Telegram cards for reviews. Given a row, the text and buttons a card should
 * show right now (the only outside input is GOOGLE_PLACE_ID, for the Maps
 * link). Every state change re-renders the whole card, so a card never shows
 * buttons for an action that no longer applies.
 *
 * The first line names the source in capitals so nobody mistakes a public
 * Google review (we reply on Google Maps) for a website review (no reply;
 * approve or reject only). Plain text — no parse_mode, nothing to escape.
 */

export const GOOGLE_CARD_HEADER = "⭐ GOOGLE MAPS REVIEW";
export const SHOP_CARD_HEADER = "🛍 SHOP REVIEW · mpillow website";

/** Telegram's hard limit for a message; a longer card is never delivered. */
const TELEGRAM_MAX_CHARS = 4096;
const MAX_ERROR_CHARS = 300;
const MAX_CURRENT_REPLY_CHARS = 600;

export type Card = { text: string; replyMarkup?: InlineKeyboardMarkup };

// ---------------------------------------------------------------------------
// Callback data: rv:<source>:<action>:<id>[:<draft version>] — at most 52 bytes,
// inside Telegram's 64. Post carries the draft version the tapper was looking
// at, so a draft edited a moment earlier is never published unseen.
// ---------------------------------------------------------------------------

export const REVIEW_CALLBACK_PREFIX = "rv:";

/**
 * The id on every button of a preview card (lib/reviews/preview.ts). It never
 * matches a review; the Telegram handler answers a tap on it with the tapper's
 * access instead of acting.
 */
export const PREVIEW_REVIEW_ID = "00000000-0000-4000-8000-000000000000";
/** First line of every preview card; the real header follows on the next line. */
export const PREVIEW_CARD_PREFIX = "🧪 PREVIEW — ";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewCallback =
  | { source: "google"; action: "post"; id: string; version: number }
  | { source: "google"; action: "skip"; id: string }
  | { source: "shop"; action: "approve" | "reject"; id: string };

export function encodeReviewCallback(cb: ReviewCallback): string {
  if (cb.source === "google") {
    return cb.action === "post" ? `rv:g:post:${cb.id}:${cb.version}` : `rv:g:skip:${cb.id}`;
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
    if (action === "skip" && parts.length === 4) return { source: "google", action, id };
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

/** The business's reviews on Google Maps; null until GOOGLE_PLACE_ID is set. */
export function googleReviewsUrl(): string | null {
  const placeId = process.env.GOOGLE_PLACE_ID?.trim();
  return placeId ? `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}` : null;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function quoted(text: string | null | undefined, empty: string, max = 1200): string {
  const t = text?.trim();
  return t ? `“${clip(t, max)}”` : empty;
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

/** Why a settled review is back: the rating moved into another reply type. */
function reopenedLine(row: GoogleReviewRow): string {
  const from = row.reopened_from_rating;
  const change =
    from && row.star_rating && from !== row.star_rating
      ? `the rating changed from ${from}★ to ${row.star_rating}★`
      : "the reviewer edited this review";
  return `🔄 REOPENED — ${change}${row.google_reply ? " after it was answered" : ""}.`;
}

export type GoogleCardOptions = {
  /**
   * CRM slice 12: the Admin Panel link to confirm a suggested customer, when
   * the review has one. The line names nobody: the Staff group is a shared
   * chat (CRM README, third hazard).
   */
  possibleCustomerMatch?: string | null;
};

/** The line a Google card gains when a customer may have written the review. */
export function possibleCustomerMatchLine(url: string): string {
  return `👤 Possible customer match: confirm in the Admin Panel: ${url}`;
}

/**
 * The card for a Google review in its current state. A long review is clipped
 * harder until the whole card fits Telegram's limit, so the card always sends.
 */
export function renderGoogleReviewCard(row: GoogleReviewRow, opts: GoogleCardOptions = {}): Card {
  let card = renderGoogleCardWithin(row, 1200, opts);
  for (const reviewChars of [600, 200]) {
    if (card.text.length <= TELEGRAM_MAX_CHARS) break;
    card = renderGoogleCardWithin(row, reviewChars, opts);
  }
  return card;
}

function renderGoogleCardWithin(row: GoogleReviewRow, reviewChars: number, opts: GoogleCardOptions): Card {
  const style = replyStyleFor(row.star_rating);
  const open = !SETTLED.includes(row.status);
  const lines: string[] = [
    GOOGLE_CARD_HEADER,
    `${starLine(row.star_rating)} · ${reviewerLabel(row)}`,
  ];
  // A 1–2★ review is a customer to win back, not just a reply to post.
  if (style === "service_recovery" && open) {
    lines.push("🛟 SERVICE RECOVERY — reply soon, and follow up with this customer personally if you can identify them.");
  }
  if (row.reopened_at && open) lines.push(reopenedLine(row));
  const posted = formatCardDate(row.review_created_at);
  if (posted) lines.push(`Posted ${posted}`);
  lines.push("", quoted(row.comment, "(Rating only — no written review)", reviewChars));
  const edited = editedLine(row);
  if (edited) lines.push(edited);
  if (opts.possibleCustomerMatch) lines.push(possibleCustomerMatchLine(opts.possibleCustomerMatch));
  lines.push("");

  switch (row.status) {
    case "posting":
      lines.push("⏳ Posting the reply to Google Maps…");
      return { text: lines.join("\n") };

    case "posted": {
      const by = row.acted_by_name ? ` by ${row.acted_by_name}` : "";
      const at = formatCardDate(row.posted_at);
      lines.push(`✅ Replied on Google Maps${by}${at ? ` · ${at}` : ""}`, row.posted_reply ?? "");
      const url = googleReviewsUrl();
      if (url) lines.push("", `🔗 Check it on Google Maps: ${url}`);
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
  // A reopened review usually already has a reply on Google; posting replaces it.
  const replacing = !!row.google_reply;
  if (replacing) {
    lines.push("💬 Our reply on Google now (posting replaces it):", clip(row.google_reply ?? "", MAX_CURRENT_REPLY_CHARS), "");
  }
  if (row.draft_reply) {
    const heading =
      row.draft_source === "staff"
        ? `✍️ Reply written by ${row.acted_by_name ?? "a review manager"}:`
        : `✍️ ${REPLY_STYLE_NAMES[style]} reply, drafted by Claude:`;
    lines.push(heading, row.draft_reply);
    for (const warning of replyWarnings(row.draft_reply, { style })) lines.push(`⚠️ ${warning}`);
  } else {
    lines.push(`✍️ No draft yet${row.draft_error ? ` — ${clip(row.draft_error, MAX_ERROR_CHARS)}` : ""}.`);
  }
  if (row.last_error) lines.push(`❌ Last attempt failed: ${clip(row.last_error, MAX_ERROR_CHARS)}`);
  lines.push(
    "",
    !row.draft_reply
      ? "👉 Review managers: reply to this message with the wording to post."
      : replacing
        ? "👉 Review managers: tap Post reply to swap our reply on Google Maps for this one, or reply to this message with your own wording to replace the draft."
        : "👉 Review managers: tap Post reply to publish this on Google Maps, or reply to this message with your own wording to replace the draft.",
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
