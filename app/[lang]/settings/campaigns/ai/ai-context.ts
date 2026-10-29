"use client";

import { createContext, useContext } from "react";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import type { RewriteOffer } from "./refine-state";

/**
 * What a block's form needs of ✨ (PRD-campaign-email-editor slices 09 and
 * 10): an empty text block offers *✨ Write this from the subject*, which
 * fills that one block; a heading or a text block offers *✨ Rewrite*, shown
 * beside it until Staff replace it or keep theirs. Null when AI writing is
 * off, so no ✨ shows.
 */
export interface CampaignAi {
  /** Writes the words of the empty text block `id`. */
  writeBlock: (id: string) => void;
  stop: () => void;
  /** Why it can't run now (a short subject, no credentials, a draft already writing), or null. */
  reason: string | null;
  /** The text block being written, and what Claude is doing. */
  writing: { id: string; stage: string } | null;
  /** ✨ Rewrite (slice 10). */
  rewrite: CampaignRewrite;
}

export interface CampaignRewrite {
  /** Why the block `id` can't be rewritten now (no credentials, another ask running), or null. */
  reason: (id: string) => string | null;
  /** The rewrite being written or on offer, and for which block. */
  offer: RewriteOffer | null;
  start: (block: RewritableBlock, action: RewriteAction, instruction?: string) => void;
  stop: () => void;
  replace: () => void;
  tryAgain: () => void;
  keepMine: () => void;
}

export const CampaignAiContext = createContext<CampaignAi | null>(null);

export const useCampaignAi = () => useContext(CampaignAiContext);
