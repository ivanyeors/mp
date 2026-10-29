"use client";

import { createContext, useContext } from "react";
import type { ChineseStatus } from "@/lib/email-campaigns/chinese-version";

/**
 * What a block's card needs in the editor's 中文 (PRD-campaign-email-editor
 * slice 17): where its 中文 words stand, and ✨ Translate and *Keep* for it.
 * Null in English, so a card's tools are English's (✨ Rewrite).
 */
export interface ChineseEditing {
  /** Where block `id`'s 中文 words stand; null for a block with no words. */
  status: (id: string) => ChineseStatus | null;
  /** Each English block's links, by block id: the only links a 中文 run can carry. */
  links: (id: string) => readonly string[];
  /** ✨ for one block, when AI writing is on; null when it is off. */
  translate: ((id: string) => void) | null;
  /** Why ✨ can't run now (no credentials, another ask running), or null. */
  reason: string | null;
  /** The block being translated now, and what the button says meanwhile. */
  working: { id: string; stage: string } | null;
  stop: () => void;
  /** *Keep*: the block's 中文 words current as they are. */
  keep: (id: string) => void;
}

export const ChineseEditingContext = createContext<ChineseEditing | null>(null);

export const useChineseEditing = () => useContext(ChineseEditingContext);
