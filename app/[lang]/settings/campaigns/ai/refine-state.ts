import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import type { IdeasKind, RefineKind, RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { EditorDraft } from "../kept-draft";

/**
 * ✨ Refine's state in the campaign editor (PRD-campaign-email-editor slice
 * 10): what the hook (use-ai-refine.ts) holds and the asks (run-refine.ts)
 * change. Its own module, so the asks, loaded later, share it without
 * importing the hook.
 */

export type IdeasField = "subject" | "preheader";

export const IDEAS_KIND: Record<IdeasField, IdeasKind> = { subject: "subjects", preheader: "preview_lines" };

/** Ideas under a field: being written (with the last ones still shown, for *More ideas*), ready, or failed. */
export interface IdeasOffer {
  status: "working" | "ready" | "failed";
  ideas: string[];
  error: string | null;
  /** Every idea shown so far: *More ideas* asks for others. */
  shown: string[];
}

/** A rewrite of one block: being written, on offer beside the block, or failed. */
export interface RewriteOffer {
  blockId: string;
  action: RewriteAction;
  /** *Something else…*: Staff's words. */
  instruction: string;
  status: "working" | "ready" | "failed";
  /** The block as it was when asked: an offer stands only while the block still is. */
  original: RewritableBlock;
  proposal: RewritableBlock | null;
  error: string | null;
  /** The rewrites already offered for it (*Try again*), so the next differs. */
  shown: RewritableBlock[];
}

export interface RefineState {
  ideas: Record<IdeasField, IdeasOffer | null>;
  rewriting: RewriteOffer | null;
  /** The ask running now: one at a time. */
  working: RefineKind | null;
}

/** What run-refine.ts's asks read and change: the history, this state, and the ask running now (Stop aborts it). */
export interface RefineStore {
  campaignId: string | null;
  history: () => EditorHistory<EditorDraft>;
  state: () => RefineState;
  update: (fn: (s: RefineState) => RefineState) => void;
  live: { current: AbortController | null };
}

export const EMPTY_REFINE: RefineState = { ideas: { subject: null, preheader: null }, rewriting: null, working: null };

/** Pure — the block `original.id` in `content` is still exactly `original`. */
export const unchanged = (content: CampaignContent | null, original: RewritableBlock) => {
  const now = content?.blocks.find((b) => b.id === original.id);
  return Boolean(now) && (now === original || JSON.stringify(now) === JSON.stringify(original));
};
