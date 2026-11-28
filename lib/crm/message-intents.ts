export const MESSAGE_CHANNELS = ["email", "whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_INTENTS = ["check_in", "review", "after_readjustment", "invite_readjustment"] as const;
export type MessageIntent = (typeof MESSAGE_INTENTS)[number];

export const MESSAGE_INTENT_LABELS: Record<MessageIntent, string> = {
  check_in: "Check in",
  review: "About their review",
  after_readjustment: "After a re-adjustment",
  invite_readjustment: "Invite to a re-adjustment",
};
