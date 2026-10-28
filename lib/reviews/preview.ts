import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import {
  PREVIEW_CARD_PREFIX,
  PREVIEW_REVIEW_ID,
  renderGoogleReviewCard,
  renderShopReviewCard,
  type Card,
} from "@/lib/reviews/cards";
import { claudeConfigured, draftInputFor, draftReviewReply } from "@/lib/reviews/draft-reply";
import type { GoogleReviewRow } from "@/lib/reviews/google-reviews";
import { inboxPreviewCard } from "@/lib/social-inbox/preview";
import { sendGroupMessage } from "@/lib/telegram/bot-api";

/**
 * A preview of review cards for the measurements Telegram group: sample
 * reviews rendered by the production card code, so the group sees exactly what
 * real reviews will look like. Sent from Users & permissions → Telegram
 * ("Send preview") or scripts/telegram-review-preview.ts.
 *
 * Nothing here touches the database or Google. Every card opens with a PREVIEW
 * line so nobody mistakes it for a real review, and its buttons carry
 * PREVIEW_REVIEW_ID: the Telegram handler answers a tap, or a reply to the
 * card, with the person's access instead of acting. With Claude configured
 * (see draft-reply.ts) the Google replies are real Claude drafts of the
 * samples; without it, sample text is used and the card says so.
 */

export const PREVIEW_INTRO = [
  "🧪 REVIEW & MESSAGE CARDS — PREVIEW",
  "Sample cards showing how new Google Maps and shop reviews, and customer messages from Facebook, Instagram and TikTok, will arrive here. None of them are real, nothing will be posted to Google, and nothing is sent to a customer.",
  "",
  "Tap any button to check your access: it tells you whether you're set up, and as what. Reply to a Google card with your own wording to see how editing a draft works, or to the Instagram message to see how answering a customer works. Not set up yet? An admin adds you under Settings → Users & permissions → Telegram.",
].join("\n");

export type PreviewCard = { what: string; card: Card };

type GoogleSample = {
  what: string;
  row: GoogleReviewRow;
  /** Used when Claude is not called (or fails); null for a card that shows no draft. */
  sampleReply: string | null;
};

function sampleRow(now: Date, overrides: Partial<GoogleReviewRow>): GoogleReviewRow {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  return {
    id: PREVIEW_REVIEW_ID,
    review_name: "accounts/preview/locations/preview/reviews/preview",
    source: "business_profile",
    maps_uri: null,
    star_rating: 5,
    comment: null,
    reviewer_name: null,
    reviewer_is_anonymous: false,
    review_created_at: at(1),
    review_updated_at: at(1),
    google_reply: null,
    google_reply_updated_at: null,
    status: "pending",
    draft_reply: null,
    draft_source: "claude",
    draft_version: 1,
    draft_error: null,
    posted_reply: null,
    posted_at: null,
    acted_by_telegram_user_id: null,
    acted_by_name: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    last_error: null,
    reopened_at: null,
    reopened_from_rating: null,
    created_at: at(1),
    updated_at: at(1),
    ...overrides,
  };
}

function googleSamples(now: Date): GoogleSample[] {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  return [
    {
      what: "a new 5★ review, with a thank-you reply",
      row: sampleRow(now, {
        star_rating: 5,
        reviewer_name: "Jane Tan",
        comment:
          "Came in for a fitting on Saturday. The team measured my shoulders and adjusted the height twice until it felt right. First night in months I woke up without a stiff neck!",
      }),
      sampleReply:
        "Thank you, Jane! We're so glad the extra height adjustment made the difference and that you woke up without a stiff neck. Taking the time to get the fit right is exactly what our fittings are for. Anyone curious can book a fitting through our website, and we look forward to seeing you again.",
    },
    {
      what: "a new 3★ review, with a constructive reply",
      row: sampleRow(now, {
        star_rating: 3,
        reviewer_name: "Marcus Lee",
        comment: "Pillow is comfortable, but delivery took almost two weeks and nobody updated me on where it was.",
      }),
      sampleReply:
        "Thank you for the honest feedback, Marcus. We're glad the pillow is comfortable, but waiting almost two weeks without an update isn't the experience we want for anyone. We're looking at how we keep customers informed while orders are on the way. Please reach out to our support team directly so we can make it right.",
    },
    {
      what: "a new 1★ review, with a service-recovery reply",
      row: sampleRow(now, {
        star_rating: 1,
        reviewer_name: "Aisha R.",
        comment: "Paid a lot for a custom pillow and it's gone flat after six weeks. Really disappointed.",
      }),
      sampleReply: `Aisha, we're truly sorry your pillow has gone flat after only six weeks. That's not the support you should be getting, and we understand how frustrating it is when you're counting on it to sleep well. The stuffing is covered by our warranty, and we'd like to check it and get the fit right again. Please message us on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY} so we can make this right. We want to get this right for you.`,
    },
    {
      what: "a review reopened after its rating dropped from 5★ to 2★",
      row: sampleRow(now, {
        star_rating: 2,
        reviewer_name: "Daniel Wong",
        comment: "Update: it was great at first, but the height feels too low now and my neck aches again.",
        review_created_at: at(24 * 40),
        review_updated_at: at(1),
        google_reply:
          "Thank you, Daniel! We're delighted the fitting helped and that you're sleeping better. We look forward to seeing you again.",
        google_reply_updated_at: at(24 * 39),
        reopened_at: at(0),
        reopened_from_rating: 5,
      }),
      sampleReply: `Daniel, we're sorry things have changed since your first review. A pillow that now feels too low, and an aching neck, is the opposite of what we set out to do. We'd like to invite you back for a re-adjustment visit to retune the height and review your fit. Please message us on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY} so we can arrange it. We want to get this right for you.`,
    },
    {
      what: "how a card looks after a review manager taps Post",
      row: sampleRow(now, {
        star_rating: 4,
        reviewer_name: "Sarah K.",
        comment: "Comfortable and easy to wash. Took a few nights to get used to.",
        status: "posted",
        posted_reply:
          "Thank you, Sarah! We're glad you're finding it comfortable and easy to care for — a few nights to settle in is completely normal with a new pillow. We look forward to seeing you again.",
        posted_at: at(0),
        acted_by_name: "Ivan",
      }),
      sampleReply: null,
    },
    {
      what: "a new 4★ review read through the Places API, answered on Google Maps by hand",
      row: sampleRow(now, {
        source: "places",
        review_name: "places/preview/reviews/preview",
        star_rating: 4,
        reviewer_name: "Priya S.",
        comment: "Lovely team and the fitting was quick. Still getting used to the firmer feel.",
      }),
      sampleReply:
        "Thank you, Priya! We're glad the fitting felt quick and that you enjoyed meeting the team. A firmer feel can take a week or two to settle into, and if it still doesn't feel right after that, we're always happy to fine-tune it. We look forward to seeing you again.",
    },
  ];
}

function marked(what: string, card: Card, note = ""): Card {
  return {
    text: `${PREVIEW_CARD_PREFIX}${what}. Sample review, not real.${note}\n${card.text}`,
    replyMarkup: card.replyMarkup,
  };
}

export async function buildReviewCardPreview(
  opts: { now?: Date; draft?: typeof draftReviewReply | null } = {},
): Promise<{ cards: PreviewCard[]; usedClaude: boolean; draftErrors: string[] }> {
  const now = opts.now ?? new Date();
  const draft =
    opts.draft === undefined ? (claudeConfigured() ? draftReviewReply : null) : opts.draft;
  const draftErrors: string[] = [];

  const samples = googleSamples(now);
  const google = await Promise.all(
    samples.map(async ({ what, row, sampleReply }) => {
      if (sampleReply === null) return marked(what, renderGoogleReviewCard(row));
      if (draft) {
        const result = await draft(draftInputFor(row));
        if (result.ok) {
          return marked(what, renderGoogleReviewCard({ ...row, draft_reply: result.reply }), " The reply is a real Claude draft.");
        }
        draftErrors.push(result.error);
      }
      return marked(
        what,
        renderGoogleReviewCard({ ...row, draft_reply: sampleReply }),
        " The reply is sample text standing in for Claude's draft.",
      );
    }),
  );

  const shop = marked(
    "a new shop review",
    renderShopReviewCard({
      id: PREVIEW_REVIEW_ID,
      author_name: "Ada L.",
      rating: 4,
      title: "Comfy",
      body: "My neck feels better after a week. The cover is really soft.",
      status: "pending",
      created_at: now.toISOString(),
      productName: "Mpillow Premium",
    }),
  );

  const cards: PreviewCard[] = [
    ...google.map((card, i) => ({ what: samples[i].what, card })),
    { what: "a new shop review", card: shop },
  ];
  return { cards, usedClaude: !!draft && draftErrors.length === 0, draftErrors };
}

export type PreviewResult = {
  ok: boolean;
  sent: number;
  total: number;
  usedClaude: boolean;
  error?: string;
};

/**
 * Sends the intro, every review preview card, then a sample customer message
 * card (lib/social-inbox/preview.ts); stops at the first failure and says why.
 */
export async function sendReviewCardPreview(
  opts: { now?: Date; draft?: typeof draftReviewReply | null; send?: typeof sendGroupMessage } = {},
): Promise<PreviewResult> {
  const send = opts.send ?? sendGroupMessage;
  const { cards, usedClaude } = await buildReviewCardPreview(opts);
  const messages: Card[] = [
    { text: PREVIEW_INTRO },
    ...cards.map((c) => c.card),
    inboxPreviewCard(opts.now ?? new Date()),
  ];
  let sent = 0;
  for (const message of messages) {
    const res = await send(message.text, message.replyMarkup);
    if (!res.ok) return { ok: false, sent, total: messages.length, usedClaude, error: res.error };
    sent += 1;
  }
  return { ok: true, sent, total: messages.length, usedClaude };
}
