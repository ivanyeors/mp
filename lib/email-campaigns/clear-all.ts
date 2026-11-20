import { EMPTY_CAMPAIGN_CONTENT, type CampaignContent } from "./content";
import type { CampaignButtonTarget, CampaignDraft } from "./rules";

export type CampaignButtonChoice = "none" | CampaignButtonTarget;

export interface CampaignWords {
  name: string;
  subject: string;
  preheader: string;
  body: string;
  button: { choice: CampaignButtonChoice; label: string; url: string };
  content: CampaignContent | null;
}

export const EMPTY_CAMPAIGN_WORDS: CampaignWords = {
  name: "",
  subject: "",
  preheader: "",
  body: "",
  button: { choice: "none", label: "", url: "" },
  content: EMPTY_CAMPAIGN_CONTENT,
};

export const CLEAR_ALL_UNDO_MS = 10_000;

export function campaignWordsOf(
  d: Pick<CampaignDraft, "name" | "subject" | "preheader" | "body" | "button" | "content">,
): CampaignWords {
  return {
    name: d.name,
    subject: d.subject,
    preheader: d.preheader ?? "",
    body: d.body,
    button: { choice: d.button?.target ?? "none", label: d.button?.label ?? "", url: d.button?.url ?? "" },
    content: d.content,
  };
}

export function campaignWordsEmpty(w: CampaignWords): boolean {
  return (
    w.name === "" &&
    w.subject === "" &&
    w.preheader === "" &&
    w.body === "" &&
    w.button.choice === "none" &&
    !w.content?.blocks.length
  );
}

export type ClearAllBlocker = "locked" | "sending" | "empty";

export const CLEAR_ALL_BLOCKER_TEXT: Record<ClearAllBlocker, string> = {
  locked: "Sending has started, so the email is fixed. Duplicate it to write a new one.",
  sending: "A wave is sending, so the email is fixed.",
  empty: "Nothing to clear: every field is on its placeholder.",
};

export function clearAllBlocker(p: { locked: boolean; sending: boolean; words: CampaignWords }): ClearAllBlocker | null {
  if (p.locked) return "locked";
  if (p.sending) return "sending";
  if (campaignWordsEmpty(p.words)) return "empty";
  return null;
}

export function clearCampaignWords(words: CampaignWords): { words: CampaignWords; snapshot: CampaignWords } {
  return {
    words: { ...EMPTY_CAMPAIGN_WORDS, content: words.content ? EMPTY_CAMPAIGN_CONTENT : null },
    snapshot: {
      ...words,
      button: { ...words.button },
      content: words.content ? (JSON.parse(JSON.stringify(words.content)) as CampaignContent) : null,
    },
  };
}
