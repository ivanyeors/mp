"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHistory } from "@/components/block-editor/use-editor-history";
import type { DraftGoal } from "@/lib/email-campaigns/ai-draft-brief";
import { keepAiDrafted, type DraftMode, type DraftStage } from "@/lib/email-campaigns/ai-drafted";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import { keepAiDraft } from "../ai-actions";
import type { EditorDraft } from "../kept-draft";

export interface AiBrief {
  about: string;
  goal: DraftGoal | null;
  products: string[];
}

export type AiDraftWhere = { scope: "email"; mode: DraftMode } | { scope: "text"; target: string };

export interface AiDraftRun {
  n: number;
  burst: string;
  where: AiDraftWhere;
  brief: AiBrief;
  status: "working" | "done" | "stopped" | "failed";
  stage: DraftStage;
  error: string | null;
  notes: string[];
  draftId: string | null;
  blocks: string[];
  step: number | null;
}

export interface AiIdeas {
  subjects: string[];
  preheaders: string[];
}

const NO_IDEAS: AiIdeas = { subjects: [], preheaders: [] };

export function useAiDraft({ history, campaignId }: { history: EditorHistory<EditorDraft>; campaignId: string | null }) {
  const [run, setRun] = useState<AiDraftRun | null>(null);
  const [ideas, setIdeas] = useState<AiIdeas>(NO_IDEAS);
  const latest = useRef(history);
  const live = useRef<AbortController | null>(null);
  const runs = useRef(0);
  const awaiting = useRef<number | null>(null);
  const steps = useRef(new Map<number, number>());
  useEffect(() => {
    latest.current = history;
  });
  useEffect(() => {
    const n = awaiting.current;
    if (n === null) return;
    awaiting.current = null;
    steps.current.set(n, history.step);
    setRun((r) => (r && r.n === n && r.step === null ? { ...r, step: history.step } : r));
  }, [history.step]);
  useEffect(() => () => live.current?.abort(), []);

  const current = Boolean(run && run.step !== null && run.step === history.step);
  const isPresent = (n: number) => {
    const step = steps.current.get(n);
    return step === undefined ? awaiting.current === n : latest.current.step === step;
  };

  useEffect(() => {
    if (run?.status === "working" && run.step !== null && history.step < run.step) live.current?.abort();
  }, [run, history.step]);

  const start = useCallback(
    async (brief: AiBrief, where: AiDraftWhere, { exclude }: { exclude?: readonly string[] } = {}) => {
      const draft = latest.current.value;
      if (live.current || !draft.content) return;
      const n = ++runs.current;
      const burst = `ai-draft-${n}`;
      const controller = new AbortController();
      live.current = controller;
      setRun({ n, burst, where, brief, status: "working", stage: "reading", error: null, notes: [], draftId: null, blocks: [], step: null });
      if (where.scope === "email") setIdeas(NO_IDEAS);

      let touched = false;
      const update = (patch: Partial<AiDraftRun>) => setRun((r) => (r && r.n === n ? { ...r, ...patch } : r));
      const hooks = {
        change: (fn: (c: CampaignContent) => CampaignContent) => {
          if (!touched) {
            touched = true;
            awaiting.current = n;
          }
          latest.current.set((e) => (e.content ? { ...e, content: fn(e.content) } : e), { burst, hold: true });
        },
        update,
        ideas: (patch: Partial<AiIdeas>) => setIdeas((i) => ({ ...i, ...patch })),
        fail: (error: string) => {
          if (touched && isPresent(n)) latest.current.undo();
          setIdeas(NO_IDEAS);
          update({ status: "failed", error, blocks: [] });
        },
      };
      try {
        const { draftRequest, runDraft } = await import("./run-draft");
        await runDraft(draftRequest(draft, brief, where, { campaignId, exclude }), where, controller.signal, hooks);
      } catch (err) {
        hooks.fail(err instanceof Error ? err.message : String(err));
      } finally {
        live.current = null;
      }
    },
    [campaignId],
  );

  const stop = useCallback(() => live.current?.abort(), []);

  const together = run && current ? { burst: run.burst, hold: true } : undefined;

  const keep = () => {
    if (!run) return;
    const ids = run.blocks;
    latest.current.set((e) => (e.content ? { ...e, content: keepAiDrafted(e.content, ids) } : e), together);
    if (run.draftId) void keepAiDraft(run.draftId, campaignId).catch(() => undefined);
    setRun(null);
  };

  const undo = () => {
    if (run && current) latest.current.undo();
    setRun(null);
    setIdeas(NO_IDEAS);
  };

  const tryAgain = () => {
    if (!run) return;
    const { brief, where, blocks } = run;
    if (current) latest.current.undo();
    setRun(null);
    void start(brief, where, { exclude: blocks });
  };

  const pick = (field: "subject" | "preheader", value: string) => {
    latest.current.set((e) => ({ ...e, [field]: value }), together);
    setIdeas((i) => ({ ...i, [field === "subject" ? "subjects" : "preheaders"]: [] }));
  };
  const dismissIdeas = (field: "subject" | "preheader") => setIdeas((i) => ({ ...i, [field === "subject" ? "subjects" : "preheaders"]: [] }));
  const dismiss = () => setRun(null);

  const showBar = Boolean(run && (run.status === "working" || run.status === "failed" || current));
  return { run, ideas, current, showBar, start, stop, keep, undo, tryAgain, pick, dismissIdeas, dismiss, working: run?.status === "working" };
}

export type AiDraft = ReturnType<typeof useAiDraft>;
