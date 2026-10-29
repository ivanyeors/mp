/**
 * Clear all (PRD-campaign-email-editor slice 01, decision 7): the email back
 * to its placeholders, with Undo in place of a confirmation, because nothing
 * is saved until Save. Pure; the editor keeps the snapshot and shows the
 * toast, and nothing here reads or writes the database.
 *
 * It clears what the email says (the campaign name, subject, preview line,
 * message and button) and keeps who it goes to (the audience and Segment) and
 * the greeting switch, which are settings, not words.
 */
import type { CampaignButtonTarget, CampaignDraft } from "./rules";

/** The editor's button choice: none, or where it goes. */
export type CampaignButtonChoice = "none" | CampaignButtonTarget;

/** What the email says, as the editor holds it. An empty string is a field on its placeholder. */
export interface CampaignWords {
  name: string;
  subject: string;
  preheader: string;
  body: string;
  button: { choice: CampaignButtonChoice; label: string; url: string };
}

/** Every field on its placeholder, and *No button*. */
export const EMPTY_CAMPAIGN_WORDS: CampaignWords = {
  name: "",
  subject: "",
  preheader: "",
  body: "",
  button: { choice: "none", label: "", url: "" },
};

/** How long the toast offers Undo. */
export const CLEAR_ALL_UNDO_MS = 10_000;

/** Pure — a draft's words, as the editor holds them. */
export function campaignWordsOf(d: Pick<CampaignDraft, "name" | "subject" | "preheader" | "body" | "button">): CampaignWords {
  return {
    name: d.name,
    subject: d.subject,
    preheader: d.preheader ?? "",
    body: d.body,
    button: { choice: d.button?.target ?? "none", label: d.button?.label ?? "", url: d.button?.url ?? "" },
  };
}

/**
 * Pure — every field shows its placeholder, and there is no button. A field
 * holding only spaces shows them, not its placeholder, so it is not empty.
 * With *No button* the hidden label and link do not count.
 */
export function campaignWordsEmpty(w: CampaignWords): boolean {
  return w.name === "" && w.subject === "" && w.preheader === "" && w.body === "" && w.button.choice === "none";
}

export type ClearAllBlocker = "locked" | "sending" | "empty";

/** Why Clear all is off, as its tooltip says it. */
export const CLEAR_ALL_BLOCKER_TEXT: Record<ClearAllBlocker, string> = {
  locked: "Sending has started, so the email is fixed. Duplicate it to write a new one.",
  sending: "A wave is sending, so the email is fixed.",
  empty: "Nothing to clear: every field is on its placeholder.",
};

/** Pure — why Clear all can't run now, or null when it can. */
export function clearAllBlocker(p: { locked: boolean; sending: boolean; words: CampaignWords }): ClearAllBlocker | null {
  if (p.locked) return "locked";
  if (p.sending) return "sending";
  if (campaignWordsEmpty(p.words)) return "empty";
  return null;
}

/**
 * Pure — Clear all: the words back to their placeholders, and the snapshot
 * that Undo puts back exactly. The audience, Segment and greeting are not
 * words, so neither holds them and Undo leaves them as they are then.
 */
export function clearCampaignWords(words: CampaignWords): { words: CampaignWords; snapshot: CampaignWords } {
  return { words: EMPTY_CAMPAIGN_WORDS, snapshot: { ...words, button: { ...words.button } } };
}
