import { MP_CONFIG_TELEGRAM_CHAT_ID } from "@/lib/telegram/notify";
import {
  answerCallback,
  deleteGroupMessage,
  editGroupCard,
  replyInChat,
  replyInGroup,
} from "@/lib/telegram/bot-api";
import { authorizeTelegramAction, redeemTelegramLinkCode } from "@/lib/telegram/operators";
import { TELEGRAM_ROLE_LABELS, type TelegramAction, type TelegramRole } from "@/lib/telegram/roles";
import { isRateLimited } from "@/lib/rate-limit";
import {
  GOOGLE_CARD_HEADER,
  PREVIEW_CARD_PREFIX,
  PREVIEW_REVIEW_ID,
  REVIEW_CALLBACK_PREFIX,
  parseReviewCallback,
  type ReviewCallback,
  renderGoogleReviewCard,
  renderShopReviewCard,
} from "@/lib/reviews/cards";
import { getGoogleReviewByCard, type GoogleReviewRow } from "@/lib/reviews/google-reviews";
import {
  claimGoogleReviewPost,
  executeGoogleReviewPost,
  setStaffDraft,
  skipGoogleReview,
  type Actor,
} from "@/lib/reviews/google-actions";
import { moderateShopReview } from "@/lib/reviews/shop-reviews";

/**
 * The review half of the Telegram bot: buttons on review cards, replies to a
 * Google card (a review manager's own wording), and `/link CODE`.
 *
 * Runs before the inventory bot's TELEGRAM_ALLOWED_CHATS check on purpose:
 * this path has its own, stricter gate — cards live only in the measurements
 * group (MP_CONFIG_TELEGRAM_CHAT_ID), and every change needs a linked, active
 * operator whose role grants it (Users & permissions → Telegram).
 */

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };

export type ReviewTelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: TelegramUser;
    text?: string;
    reply_to_message?: { message_id: number; text?: string };
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

const LINK_COMMAND = /^\/link(?:@\w+)?(?:\s+(.*))?$/i;

/** A Google card, real or preview (PREVIEW line first, header second). */
function isGoogleCardText(text: string | undefined): boolean {
  if (!text) return false;
  if (text.startsWith(GOOGLE_CARD_HEADER)) return true;
  return text.startsWith(PREVIEW_CARD_PREFIX) && text.split("\n")[1] === GOOGLE_CARD_HEADER;
}

/** Does this update belong to the review flow? Cheap: no I/O. */
export function isReviewUpdate(update: ReviewTelegramUpdate): boolean {
  const data = update.callback_query?.data;
  if (data) return data.startsWith(REVIEW_CALLBACK_PREFIX);
  const message = update.message;
  const text = message?.text?.trim();
  if (!message || !text) return false;
  if (LINK_COMMAND.test(text)) return true;
  return (
    message.chat.id === MP_CONFIG_TELEGRAM_CHAT_ID &&
    !text.startsWith("/") &&
    isGoogleCardText(message.reply_to_message?.text)
  );
}

function deniedMessage(
  reason: "not_linked" | "inactive" | "forbidden",
  action: TelegramAction,
  user: TelegramUser,
  role?: keyof typeof TELEGRAM_ROLE_LABELS,
): string {
  if (reason === "inactive") return "Your Telegram access is switched off. Ask an admin to turn it back on.";
  if (reason === "forbidden") {
    const label = role ? TELEGRAM_ROLE_LABELS[role] : "Your role";
    return action === "google_review.reply"
      ? `${label}s can't reply on Google. Only review managers can.`
      : `${label}s can't moderate shop reviews.`;
  }
  return `You're not set up for review cards yet. Ask an admin to add you under Settings → Users & permissions → Telegram, then send /link with your code. (Your Telegram ID: ${user.id})`;
}

async function authorize(
  user: TelegramUser,
  action: TelegramAction,
): Promise<{ ok: true; actor: Actor; role: TelegramRole } | { ok: false; message: string; linked: boolean }> {
  const auth = await authorizeTelegramAction(user.id, action);
  if (!auth.ok) {
    return {
      ok: false,
      linked: auth.reason !== "not_linked",
      message: deniedMessage(auth.reason, action, user, auth.operator?.role),
    };
  }
  return {
    ok: true,
    actor: { telegramUserId: user.id, name: auth.operator.display_name },
    role: auth.operator.role,
  };
}

const PREVIEW_EFFECT: Record<ReviewCallback["action"], string> = {
  post: "publish the reply on Google Maps",
  skip: "remove this card without replying",
  approve: "show the review on the product page",
  reject: "hide the review from the shop",
};

async function showGoogleCard(row: GoogleReviewRow | undefined, messageId: number): Promise<void> {
  if (!row) return;
  const card = renderGoogleReviewCard(row);
  await editGroupCard(messageId, card.text, card.replyMarkup);
}

async function handleCallback(cq: NonNullable<ReviewTelegramUpdate["callback_query"]>): Promise<void> {
  const parsed = parseReviewCallback(cq.data ?? "");
  const messageId = cq.message?.message_id;
  if (!parsed || !messageId || cq.message?.chat.id !== MP_CONFIG_TELEGRAM_CHAT_ID) {
    await answerCallback(cq.id, "This button isn't valid any more.", true);
    return;
  }

  const action: TelegramAction = parsed.source === "google" ? "google_review.reply" : "shop_review.moderate";
  const auth = await authorize(cq.from, action);
  if (!auth.ok) {
    await answerCallback(cq.id, auth.message, true);
    return;
  }

  // A preview card (lib/reviews/preview.ts): the permission check above is the
  // whole point — tell them they passed, and do nothing.
  if (parsed.id === PREVIEW_REVIEW_ID) {
    await answerCallback(
      cq.id,
      `✅ You're set up as ${auth.actor.name} (${TELEGRAM_ROLE_LABELS[auth.role]}). On a real review, this button would ${PREVIEW_EFFECT[parsed.action]}.`,
      true,
    );
    return;
  }

  if (parsed.source === "shop") {
    const decision = parsed.action === "approve" ? "approved" : "rejected";
    const result = await moderateShopReview(parsed.id, decision);
    if (!result.review) {
      await answerCallback(cq.id, "This review no longer exists.", true);
      return;
    }
    await answerCallback(
      cq.id,
      result.ok ? (decision === "approved" ? "Approved — it's on the product page." : "Rejected.") : `Already ${result.review.status}.`,
    );
    const card = renderShopReviewCard(result.review, result.ok ? auth.actor.name : null);
    await editGroupCard(messageId, card.text, card.replyMarkup);
    return;
  }

  if (parsed.action === "post") {
    const claim = await claimGoogleReviewPost(parsed.id, parsed.version, auth.actor);
    if (!claim.ok) {
      await answerCallback(cq.id, claim.message, true);
      await showGoogleCard(claim.row, messageId);
      return;
    }
    await answerCallback(cq.id, "Posting to Google Maps…");
    await showGoogleCard(claim.row, messageId);
    const result = await executeGoogleReviewPost(claim.row);
    await showGoogleCard(result.row, messageId);
    if (!result.ok) await replyInGroup(`❌ Google did not take the reply: ${result.message}`, messageId);
    return;
  }

  const result = await skipGoogleReview(parsed.id, auth.actor);
  await answerCallback(cq.id, result.ok ? "Skipped — no reply will be posted." : result.message, !result.ok);
  // A card Telegram will not delete (older than 48h) is marked skipped instead.
  if (!result.ok || !(await deleteGroupMessage(messageId))) await showGoogleCard(result.row, messageId);
}

async function handleStaffReply(message: NonNullable<ReviewTelegramUpdate["message"]>): Promise<void> {
  const from = message.from;
  const cardId = message.reply_to_message?.message_id;
  const text = message.text?.trim();
  if (!from || !cardId || !text) return;

  // A preview card: show what a reply would do, and the replier's access.
  if (message.reply_to_message?.text?.startsWith(PREVIEW_CARD_PREFIX)) {
    const auth = await authorize(from, "google_review.reply");
    await replyInGroup(
      auth.ok
        ? `🧪 On a real card, your wording would replace the draft and you'd tap ✅ Post reply to publish it. You're set up as ${auth.actor.name} (${TELEGRAM_ROLE_LABELS[auth.role]}).`
        : auth.message,
      message.message_id,
    );
    return;
  }

  const row = await getGoogleReviewByCard(message.chat.id, cardId);
  if (!row) return;

  const auth = await authorize(from, "google_review.reply");
  if (!auth.ok) {
    // People chat under cards; only answer someone who is set up but not allowed.
    if (auth.linked) await replyInGroup(auth.message, message.message_id);
    return;
  }
  if (row.status !== "pending") {
    await replyInGroup("This review has already been dealt with — nothing changed.", message.message_id);
    return;
  }

  const result = await setStaffDraft(row, text, auth.actor);
  if (!result.ok) {
    await replyInGroup(`❌ ${result.message}`, message.message_id);
    await showGoogleCard(result.row, cardId);
    return;
  }
  await showGoogleCard(result.row, cardId);
  await replyInGroup("📝 Draft updated. Tap ✅ Post reply on the card to publish it on Google Maps.", message.message_id);
}

async function handleLink(message: NonNullable<ReviewTelegramUpdate["message"]>): Promise<void> {
  const from = message.from;
  if (!from) return;
  const code = LINK_COMMAND.exec(message.text?.trim() ?? "")?.[1]?.trim();
  const reply = (text: string) => replyInChat(message.chat.id, text, message.message_id);

  if (!code) {
    await reply("Usage: /link CODE — an admin gets the code from Settings → Users & permissions → Telegram.");
    return;
  }
  if (isRateLimited({ bucket: "telegram-link", key: String(from.id), windowMs: 10 * 60_000, max: 5 })) {
    await reply("Too many attempts. Wait ten minutes and try again.");
    return;
  }

  const result = await redeemTelegramLinkCode(code, { id: from.id, username: from.username ?? null });
  if (result.ok) {
    await reply(
      `✅ Linked. You're set up as ${result.operator.display_name} (${TELEGRAM_ROLE_LABELS[result.operator.role]}) and can act on review cards in the mpillow group.`,
    );
    return;
  }
  const messages: Record<typeof result.reason, string> = {
    invalid: "That code isn't valid. Ask an admin for a new one.",
    expired: "That code has expired. Ask an admin for a new one.",
    inactive: "That access is switched off. Ask an admin to turn it back on.",
    taken: `This Telegram account is already linked to ${result.takenBy ?? "someone else"}. Ask an admin to remove that entry first.`,
  };
  await reply(messages[result.reason]);
}

/** Does the work for an update `isReviewUpdate` accepted. Never throws. */
export async function handleReviewUpdate(update: ReviewTelegramUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }
    const message = update.message;
    if (!message?.text) return;
    if (LINK_COMMAND.test(message.text.trim())) {
      await handleLink(message);
      return;
    }
    await handleStaffReply(message);
  } catch (error) {
    console.error("[reviews] telegram update failed", error);
    if (update.callback_query) await answerCallback(update.callback_query.id, "Something went wrong — try again.", true);
  }
}
