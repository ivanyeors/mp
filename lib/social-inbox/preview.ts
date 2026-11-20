import { PREVIEW_CARD_PREFIX, type Card } from "@/lib/reviews/cards";
import { renderInboxCard } from "@/lib/social-inbox/cards";

export function inboxPreviewCard(now: Date): Card {
  const card = renderInboxCard({
    platform: "instagram",
    customer: { displayName: "Mei Lin", username: "meilin.sleeps" },
    text: "Hi! Do you do fittings on Sundays? My husband wakes up with a stiff neck every morning 😅",
    attachments: [],
    sentAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
  });
  return {
    text: `${PREVIEW_CARD_PREFIX}a new Instagram message. Sample message, not real — reply to it to check you can answer customers; nothing is sent.\n${card}`,
  };
}
