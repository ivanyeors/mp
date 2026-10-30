"use client";

import { useEffect, useRef, useState } from "react";
import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import { withEditedBlocks } from "@/lib/email-campaigns/ai-drafted";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import type { EditorDraft } from "../kept-draft";
import { EMPTY_REFINE, unchanged, type IdeasField, type RefineState, type RefineStore } from "./refine-state";

/**
 * ✨ Refine in the campaign editor (PRD-campaign-email-editor slice 10,
 * decision 9): subject and preview line ideas under their fields, and a
 * rewrite of one heading or text block offered beside it. One ask at a time.
 * An answer changes nothing by itself: picking an idea fills its field, and
 * *Replace* puts the rewrite in its block, each one change in the editor's
 * history that Undo takes back; *Keep mine* changes nothing. Nothing here
 * saves or sends. The asks themselves (their requests, the call, what each
 * answer does to this state, refine-state.ts) are run-refine.ts, loaded with
 * the first one.
 */

export function useAiRefine({ history, campaignId }: { history: EditorHistory<EditorDraft>; campaignId: string | null }) {
  const [state, setState] = useState<RefineState>(EMPTY_REFINE);
  const latest = useRef(history);
  const now = useRef(state);
  const live = useRef<AbortController | null>(null);
  useEffect(() => {
    latest.current = history;
    now.current = state;
  });
  useEffect(() => () => live.current?.abort(), []);

  // An offer stands only while its block is as it was: changed (or undone, or deleted), the rewrite is gone.
  const { rewriting, working } = state;
  const offer = rewriting && unchanged(history.value.content, rewriting.original) ? rewriting : null;
  const stale = Boolean(rewriting) && !offer;
  useEffect(() => {
    if (stale && working === "rewrite") live.current?.abort();
  }, [stale, working]);

  const store: RefineStore = { campaignId, history: () => latest.current, state: () => now.current, update: setState, live };
  const ask = (go: (m: typeof import("./run-refine")) => Promise<void>) => void import("./run-refine").then(go);

  /** *Replace*: the rewrite in its block, one change that Undo takes back. A person chose it, so it isn't marked *Drafted with AI*. */
  const replace = () => {
    const o = now.current.rewriting;
    const proposal = o?.proposal;
    if (!o || !proposal || !unchanged(latest.current.value.content, o.original)) return;
    latest.current.set((e) => (e.content ? { ...e, content: withEditedBlocks(e.content, e.content.blocks.map((b) => (b.id === o.blockId ? proposal : b))) } : e));
    setState((s) => ({ ...s, rewriting: null }));
  };

  /** *Keep mine*: the block as it is, untouched. */
  const keepMine = () => {
    if (now.current.rewriting?.status === "working") live.current?.abort();
    setState((s) => ({ ...s, rewriting: null }));
  };

  /** An idea in its field: one change, which Undo takes back. */
  const pick = (field: IdeasField, idea: string) => {
    latest.current.set((e) => ({ ...e, [field]: idea }));
    setState((s) => ({ ...s, ideas: { ...s.ideas, [field]: null } }));
  };

  const dismissIdeas = (field: IdeasField) => {
    if (now.current.ideas[field]?.status === "working") live.current?.abort();
    setState((s) => ({ ...s, ideas: { ...s.ideas, [field]: null } }));
  };

  return {
    ideas: state.ideas,
    offer,
    working,
    /** Ideas for `field`: five subject lines, or two preview lines; `more` asks for others than those shown. */
    suggest: (field: IdeasField, opts?: { more?: boolean }) => ask((m) => m.suggest(store, field, opts)),
    /** Asks for a rewrite of `block`, offered beside it. */
    rewrite: (block: RewritableBlock, action: RewriteAction, instruction?: string) => ask((m) => m.rewrite(store, block, action, instruction)),
    /** *Try again*: the same ask, for a rewrite other than those offered. */
    tryAgain: () => ask((m) => m.tryAgain(store)),
    pick,
    dismissIdeas,
    replace,
    keepMine,
    stop: () => live.current?.abort(),
  };
}

export type AiRefine = ReturnType<typeof useAiRefine>;
