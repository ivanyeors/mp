import type { InlineKeyboardButton, InlineKeyboardMarkup } from "@/lib/telegram/bot-api";
import type { GoogleReviewRow } from "@/lib/reviews/google-reviews";
import { MAX_REPLY_CHARS, replyWarnings } from "@/lib/reviews/reply-rules";
import { REPLY_STYLE_NAMES, replyStyleFor } from "@/lib/reviews/reply-style";

export const GOOGLE_CARD_HEADER = "⭐ GOOGLE MAPS REVIEW";
export const SHOP_CARD_HEADER = "🛍 SHOP REVIEW · mpillow website";

const TELEGRAM_MAX_CHARS = 4096;
const MAX_ERROR_CHARS = 300;
const MAX_CURRENT_REPLY_CHARS = 600;

export type Card = { text: string; replyMarkup?: InlineKeyboardMarkup };

export const TEAM_NOTE_PREFIX = "//";
const TEAM_NOTE_LINE = `Start a reply with ${TEAM_NOTE_PREFIX} for a team-only note.`;

export const REVIEW_CALLBACK_PREFIX = "rv:";

export const PREVIEW_REVIEW_ID = "00000000-0000-4000-8000-000000000000";
export const PREVIEW_CARD_PREFIX = "🧪 PREVIEW — ";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewCallback =
  | { source: "google"; action: "post" | "done"; id: string; version: number }
  | { source: "google"; action: "skip"; id: string }
  | { source: "shop"; action: "approve" | "reject" | "unreply"; id: string };

export function encodeReviewCallback(cb: ReviewCallback): string {
  if (cb.source === "google") {
    return cb.action === "skip" ? `rv:g:skip:${cb.id}` : `rv:g:${cb.action}:${cb.id}:${cb.version}`;
  }
  return `rv:s:${cb.action}:${cb.id}`;
}

export function parseReviewCallback(data: string): ReviewCallback | null {
  const parts = data.split(":");
  if (parts[0] !== "rv" || !UUID.test(parts[3] ?? "")) return null;
  const [, source, action, id, version] = parts;
  if (source === "g") {
    if ((action === "post" || action === "done") && parts.length === 5 && /^\d{1,6}$/.test(version ?? "")) {
      return { source: "google", action, id, version: Number(version) };
    }
    if (action === "skip" && parts.length === 4) return { source: "google", action, id };
  }
  if (source === "s" && (action === "approve" || action === "reject" || action === "unreply") && parts.length === 4) {
    return { source: "shop", action, id };
  }
  return null;
}

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

function editedLine(row: GoogleReviewRow): string | null {
  if (!row.review_created_at || !row.review_updated_at) return null;
  const created = new Date(row.review_created_at).getTime();
  const updated = new Date(row.review_updated_at).getTime();
  if (!(updated - created > 60_000)) return null;
  return `✏️ Edited by the reviewer · ${formatCardDate(row.review_updated_at)}`;
}

const SETTLED: GoogleReviewRow["status"][] = ["posting", "posted", "skipped", "replied_elsewhere"];

function reopenedLine(row: GoogleReviewRow): string {
  const from = row.reopened_from_rating;
  const change =
    from && row.star_rating && from !== row.star_rating
      ? `the rating changed from ${from}★ to ${row.star_rating}★`
      : "the reviewer edited this review";
  return `🔄 REOPENED — ${change}${row.google_reply ? " after it was answered" : ""}.`;
}

export type GoogleCardOptions = {
  possibleCustomerMatch?: string | null;
};

export function possibleCustomerMatchLine(url: string): string {
  return `👤 Possible customer match: confirm in the Admin Panel: ${url}`;
}

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
      const done = row.source === "places" ? "Marked replied on Google Maps" : "Replied on Google Maps";
      lines.push(`✅ ${done}${by}${at ? ` · ${at}` : ""}`, row.posted_reply ?? "");
      const url = row.maps_uri ?? googleReviewsUrl();
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

  if (row.source === "places") return placesOpenCard(row, lines);
  const replacing = !!row.google_reply;
  if (replacing) {
    lines.push("💬 Our reply on Google now (posting replaces it):", clip(row.google_reply ?? "", MAX_CURRENT_REPLY_CHARS), "");
  }
  lines.push(...draftLines(row, style));
  if (row.last_error) lines.push(`❌ Last attempt failed: ${clip(row.last_error, MAX_ERROR_CHARS)}`);
  lines.push(
    "",
    !row.draft_reply
      ? "👉 Review managers: reply to this message with the wording to post."
      : replacing
        ? "👉 Review managers: tap Post reply to swap our reply on Google Maps for this one, or reply to this message with your own wording to replace the draft."
        : "👉 Review managers: tap Post reply to publish this on Google Maps, or reply to this message with your own wording to replace the draft.",
    TEAM_NOTE_LINE,
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

function draftLines(row: GoogleReviewRow, style: ReturnType<typeof replyStyleFor>): string[] {
  if (!row.draft_reply) return [`✍️ No draft yet${row.draft_error ? ` — ${clip(row.draft_error, MAX_ERROR_CHARS)}` : ""}.`];
  const heading =
    row.draft_source === "staff"
      ? `✍️ Reply written by ${row.acted_by_name ?? "a review manager"}:`
      : `✍️ ${REPLY_STYLE_NAMES[style]} reply, drafted by Claude:`;
  return [heading, row.draft_reply, ...replyWarnings(row.draft_reply, { style }).map((w) => `⚠️ ${w}`)];
}

function placesOpenCard(row: GoogleReviewRow, lines: string[]): Card {
  const style = replyStyleFor(row.star_rating);
  const replacing = !!row.reopened_at && !!row.posted_reply;
  lines.push(...draftLines(row, style));
  lines.push(
    "",
    !row.draft_reply
      ? "👉 Review managers: write a reply on Google Maps, then tap ✅ Mark replied. To keep your wording here first, reply to this message with it."
      : replacing
        ? "👉 Review managers: replace our reply on Google Maps with this one, then tap ✅ Mark replied. Reply to this message with your own wording to replace the draft."
        : "👉 Review managers: post this reply on Google Maps, then tap ✅ Mark replied. Reply to this message with your own wording to replace the draft.",
    TEAM_NOTE_LINE,
    "📍 Read through the Places API, which can't post replies. Post reply arrives once the Business Profile API is connected.",
  );

  const url = row.maps_uri ?? googleReviewsUrl();
  const keyboard: InlineKeyboardButton[][] = [];
  if (url) keyboard.push([{ text: "🔗 Open on Google Maps", url }]);
  keyboard.push([
    {
      text: "✅ Mark replied",
      callback_data: encodeReviewCallback({ source: "google", action: "done", id: row.id, version: row.draft_version }),
    },
    { text: "🙈 Skip", callback_data: encodeReviewCallback({ source: "google", action: "skip", id: row.id }) },
  ]);
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: keyboard } };
}

export function renderExpiredPlacesCard(row: GoogleReviewRow): string {
  const url = row.maps_uri ?? googleReviewsUrl();
  return [
    GOOGLE_CARD_HEADER,
    `${starLine(row.star_rating)} · ${reviewerLabel(row)}`,
    "",
    "⌛ This card closed after 30 days without being marked replied. If it still needs an answer, reply on Google Maps directly.",
    ...(url ? [`🔗 ${url}`] : []),
  ].join("\n");
}

export function renderMissedReviewsNotice(count: number, placeUrl: string | null): string {
  const url = placeUrl ?? googleReviewsUrl();
  const reviews = count === 1 ? "1 new Google review" : `${count} new Google reviews`;
  return [
    `⭐ ${reviews} didn't come through as a card: the Places API shows only five reviews, picked by relevance.`,
    url ? `Read and answer on Google Maps: ${url}` : "Read and answer them on Google Maps.",
  ].join("\n");
}

export type ShopReviewForCard = {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string | null;
  productName: string | null;
  store_reply: string | null;
  store_reply_at: string | null;
  store_reply_by_name: string | null;
};

const SHOP_REPLY_HOW = "💬 To answer it publicly, reply to this message with our reply.";

export function renderShopReviewCard(review: ShopReviewForCard, actedBy?: string | null): Card {
  const lines: string[] = [SHOP_CARD_HEADER, `${starLine(review.rating)} · ${review.author_name}`];
  if (review.productName) lines.push(`Product: ${review.productName}`);
  const posted = formatCardDate(review.created_at);
  if (posted) lines.push(`Posted ${posted}`);
  lines.push("");
  if (review.title?.trim()) lines.push(clip(review.title.trim(), 300));
  lines.push(quoted(review.body, "(Rating only — no written review)"), "");

  const by = actedBy ? ` by ${actedBy}` : "";
  const reply = review.store_reply?.trim() ? clip(review.store_reply.trim(), MAX_REPLY_CHARS) : null;
  const repliedAt = formatCardDate(review.store_reply_at);
  const repliedBy = `${review.store_reply_by_name ? `, by ${review.store_reply_by_name}` : ""}${repliedAt ? ` · ${repliedAt}` : ""}`;

  if (review.status === "rejected") {
    lines.push(`🚫 Rejected${by} — hidden from the shop.`);
    if (reply) lines.push("", `💬 Our reply${repliedBy}, hidden with the review:`, reply);
    return { text: lines.join("\n") };
  }

  const removeReply: InlineKeyboardButton = {
    text: "🗑 Remove reply",
    callback_data: encodeReviewCallback({ source: "shop", action: "unreply", id: review.id }),
  };

  if (review.status === "approved") {
    lines.push(`✅ Approved${by} — shown on the product page.`);
    if (!reply) {
      lines.push(`${SHOP_REPLY_HOW} It shows under the review on the product page.`, TEAM_NOTE_LINE);
      return { text: lines.join("\n") };
    }
    lines.push(
      "",
      `💬 Our reply on the product page${repliedBy}:`,
      reply,
      "",
      "👉 Reply to this message to change our reply.",
      TEAM_NOTE_LINE,
    );
    return { text: lines.join("\n"), replyMarkup: { inline_keyboard: [[removeReply]] } };
  }

  if (reply) {
    lines.push(
      `💬 Our reply${repliedBy}. It shows under the review once the review is approved:`,
      reply,
      "",
      "👉 Approve to show it on the product page, or reject to keep it hidden. Reply to this message to change our reply.",
    );
  } else {
    lines.push(
      "👉 Approve to show it on the product page, or reject to keep it hidden.",
      `${SHOP_REPLY_HOW} It shows under the review once the review is approved.`,
    );
  }
  lines.push(TEAM_NOTE_LINE);
  const keyboard: InlineKeyboardButton[][] = [
    [
      { text: "✅ Approve", callback_data: encodeReviewCallback({ source: "shop", action: "approve", id: review.id }) },
      { text: "🚫 Reject", callback_data: encodeReviewCallback({ source: "shop", action: "reject", id: review.id }) },
    ],
  ];
  if (reply) keyboard.push([removeReply]);
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: keyboard } };
}
