"use client";

import { createContext, useContext } from "react";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import type { RewriteOffer } from "./refine-state";

export interface CampaignAi {
  writeBlock: (id: string) => void;
  stop: () => void;
  reason: string | null;
  writing: { id: string; stage: string } | null;
  rewrite: CampaignRewrite;
}

export interface CampaignRewrite {
  reason: (id: string) => string | null;
  offer: RewriteOffer | null;
  start: (block: RewritableBlock, action: RewriteAction, instruction?: string) => void;
  stop: () => void;
  replace: () => void;
  tryAgain: () => void;
  keepMine: () => void;
}

export const CampaignAiContext = createContext<CampaignAi | null>(null);

export const useCampaignAi = () => useContext(CampaignAiContext);
