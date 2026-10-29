"use client";

import { useEffect, useRef, useState } from "react";
import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import { withChineseTranslation } from "@/lib/email-campaigns/chinese-version";
import type { EditorDraft } from "../kept-draft";
import type { TranslateScope } from "./run-translate";

/**
 * ✨ Translate to Chinese in the campaign editor (PRD-campaign-email-editor
 * slice 17, decision 9): the whole 中文 version, what changed in English
 * since, or one block, asked of Claude and put in as one change in the
 * editor's history, which one Undo takes back. Never saved, never sent: Save
 * and Send are Staff's. One ask at a time; Stop ends it. The ask itself is
 * run-translate.ts, loaded with the first.
 */
export function useAiTranslate({ history, campaignId, onTranslated }: { history: EditorHistory<EditorDraft>; campaignId: string | null; onTranslated: () => void }) {
  const [working, setWorking] = useState<TranslateScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ history, onTranslated });
  const live = useRef<AbortController | null>(null);
  useEffect(() => {
    latest.current = { history, onTranslated };
  });
  useEffect(() => () => live.current?.abort(), []);

  const start = async (scope: TranslateScope) => {
    if (live.current) return;
    const controller = new AbortController();
    live.current = controller;
    setWorking(scope);
    setError(null);
    try {
      const { translateRequest, runTranslate } = await import("./run-translate");
      const request = translateRequest(latest.current.history.value, scope, { campaignId });
      if (!request || controller.signal.aborted) return;
      const translation = await runTranslate(request, controller.signal);
      // Fingerprinted against the English it was asked from: a block changed meanwhile reads out of date.
      latest.current.history.set((e) => (e.content ? { ...e, content: withChineseTranslation(e.content, translation) } : e));
      latest.current.onTranslated();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (live.current === controller) live.current = null;
      setWorking(null);
    }
  };

  return {
    working,
    error,
    start: (scope: TranslateScope) => void start(scope),
    stop: () => live.current?.abort(),
    dismissError: () => setError(null),
  };
}

export type AiTranslate = ReturnType<typeof useAiTranslate>;
