"use client";

import { useEffect, useRef, useState } from "react";
import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import { withChineseTranslation } from "@/lib/email-campaigns/chinese-version";
import type { EditorDraft } from "../kept-draft";
import type { TranslateScope } from "./run-translate";

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
