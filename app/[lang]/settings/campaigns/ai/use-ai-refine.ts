"use client";

import { useEffect, useRef, useState } from "react";
import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import { withEditedBlocks } from "@/lib/email-campaigns/ai-drafted";
import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import type { EditorDraft } from "../kept-draft";
import { EMPTY_REFINE, unchanged, type IdeasField, type RefineState, type RefineStore } from "./refine-state";

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

  const { rewriting, working } = state;
  const offer = rewriting && unchanged(history.value.content, rewriting.original) ? rewriting : null;
  const stale = Boolean(rewriting) && !offer;
  useEffect(() => {
    if (stale && working === "rewrite") live.current?.abort();
  }, [stale, working]);

  const store: RefineStore = { campaignId, history: () => latest.current, state: () => now.current, update: setState, live };
  const ask = (go: (m: typeof import("./run-refine")) => Promise<void>) => void import("./run-refine").then(go);

  const replace = () => {
    const o = now.current.rewriting;
    const proposal = o?.proposal;
    if (!o || !proposal || !unchanged(latest.current.value.content, o.original)) return;
    latest.current.set((e) => (e.content ? { ...e, content: withEditedBlocks(e.content, e.content.blocks.map((b) => (b.id === o.blockId ? proposal : b))) } : e));
    setState((s) => ({ ...s, rewriting: null }));
  };

  const keepMine = () => {
    if (now.current.rewriting?.status === "working") live.current?.abort();
    setState((s) => ({ ...s, rewriting: null }));
  };

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
    suggest: (field: IdeasField, opts?: { more?: boolean }) => ask((m) => m.suggest(store, field, opts)),
    rewrite: (block: RewritableBlock, action: RewriteAction, instruction?: string) => ask((m) => m.rewrite(store, block, action, instruction)),
    tryAgain: () => ask((m) => m.tryAgain(store)),
    pick,
    dismissIdeas,
    replace,
    keepMine,
    stop: () => live.current?.abort(),
  };
}

export type AiRefine = ReturnType<typeof useAiRefine>;
