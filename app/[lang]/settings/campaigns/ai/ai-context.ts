"use client";

import { createContext, useContext } from "react";

/**
 * What a block's form needs of ✨ (PRD-campaign-email-editor slice 09): an
 * empty text block offers *✨ Write this from the subject*, which fills that
 * one block. Null when AI writing is off, so no ✨ shows.
 */
export interface CampaignAi {
  /** Writes the words of the empty text block `id`. */
  writeBlock: (id: string) => void;
  stop: () => void;
  /** Why it can't run now (a short subject, no credentials, a draft already writing), or null. */
  reason: string | null;
  /** The text block being written, and what Claude is doing. */
  writing: { id: string; stage: string } | null;
}

export const CampaignAiContext = createContext<CampaignAi | null>(null);

export const useCampaignAi = () => useContext(CampaignAiContext);
