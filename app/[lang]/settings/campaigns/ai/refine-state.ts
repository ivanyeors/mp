import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import type { IdeasKind, RefineKind, RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { EditorDraft } from "../kept-draft";

export type IdeasField = "subject" | "preheader";

export const IDEAS_KIND: Record<IdeasField, IdeasKind> = { subject: "subjects", preheader: "preview_lines" };

export interface IdeasOffer {
  status: "working" | "ready" | "failed";
  ideas: string[];
  error: string | null;
  shown: string[];
}

export interface RewriteOffer {
  blockId: string;
  action: RewriteAction;
  instruction: string;
  status: "working" | "ready" | "failed";
  original: RewritableBlock;
  proposal: RewritableBlock | null;
  error: string | null;
  shown: RewritableBlock[];
}

export interface RefineState {
  ideas: Record<IdeasField, IdeasOffer | null>;
  rewriting: RewriteOffer | null;
  working: RefineKind | null;
}

export interface RefineStore {
  campaignId: string | null;
  history: () => EditorHistory<EditorDraft>;
  state: () => RefineState;
  update: (fn: (s: RefineState) => RefineState) => void;
  live: { current: AbortController | null };
}

export const EMPTY_REFINE: RefineState = { ideas: { subject: null, preheader: null }, rewriting: null, working: null };

export const unchanged = (content: CampaignContent | null, original: RewritableBlock) => {
  const now = content?.blocks.find((b) => b.id === original.id);
  return Boolean(now) && (now === original || JSON.stringify(now) === JSON.stringify(original));
};
