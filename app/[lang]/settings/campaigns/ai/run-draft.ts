import type { DraftEvent, DraftRequest } from "@/lib/email-campaigns/ai-draft-shape";
import { withDraftBlocks, withDraftText } from "@/lib/email-campaigns/ai-drafted";
import { contentWords, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";
import type { EditorDraft } from "../kept-draft";
import type { AiBrief, AiDraftRun, AiDraftWhere, AiIdeas } from "./use-ai-draft";

export const DRAFT_CUT_OFF = "The draft stopped before it finished. Try again.";

export interface DraftRunHooks {
  change: (fn: (c: CampaignContent) => CampaignContent) => void;
  update: (patch: Partial<AiDraftRun>) => void;
  ideas: (patch: Partial<AiIdeas>) => void;
  fail: (error: string) => void;
}

export function draftRequest(
  draft: EditorDraft,
  brief: AiBrief,
  where: AiDraftWhere,
  { campaignId, exclude = [] }: { campaignId: string | null; exclude?: readonly string[] },
): DraftRequest {
  const content = draft.content as CampaignContent;
  const others = content.blocks.filter((b) => !exclude.includes(b.id) && (where.scope === "email" || b.id !== where.target));
  return {
    campaignId,
    scope: where.scope,
    subject: draft.subject,
    name: draft.name,
    about: brief.about,
    goal: brief.goal,
    products: brief.products,
    existing: where.scope === "text" || where.mode === "add" ? contentWords({ ...content, blocks: others }).filter((w) => w.trim()) : [],
  };
}

async function readDraft(request: DraftRequest, signal: AbortSignal, onEvent: (event: DraftEvent) => void): Promise<void> {
  const res = await fetch("/api/campaigns/ai-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    const answer = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(answer?.error ?? `Claude couldn't draft it (${res.status}). Try again.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const lines = (final: boolean) => {
    const parts = buffered.split("\n");
    buffered = final ? "" : (parts.pop() ?? "");
    for (const line of parts) if (line.trim()) onEvent(JSON.parse(line) as DraftEvent);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    lines(false);
  }
  buffered += decoder.decode();
  lines(true);
}

export async function runDraft(request: DraftRequest, where: AiDraftWhere, signal: AbortSignal, hooks: DraftRunHooks): Promise<void> {
  const drafted: EmailBlock[] = [];
  const ever = new Set<string>();
  let ended = false;
  const onEvent = (e: DraftEvent) => {
    switch (e.type) {
      case "stage":
        return hooks.update({ stage: "writing" });
      case "subjects":
        return hooks.ideas({ subjects: e.subjects });
      case "preheaders":
        return hooks.ideas({ preheaders: e.preheaders });
      case "block": {
        if (where.scope === "text") {
          const words = e.block.type === "text" ? e.block.paragraphs : null;
          if (words) hooks.change((c) => withDraftText(c, where.target, words));
          return hooks.update({ blocks: [where.target] });
        }
        drafted.push(e.block);
        ever.add(e.block.id);
        const now = [...drafted];
        const seen = new Set(ever);
        hooks.change((c) => withDraftBlocks(c, now, { mode: where.mode, ever: seen }));
        return hooks.update({ blocks: now.map((b) => b.id) });
      }
      case "restart": {
        drafted.length = 0;
        const seen = new Set(ever);
        hooks.change((c) => (where.scope === "text" ? withDraftText(c, where.target, null) : withDraftBlocks(c, [], { mode: where.mode, ever: seen })));
        return hooks.update({ blocks: [] });
      }
      case "done":
        ended = true;
        return hooks.update({ status: "done", draftId: e.draftId, notes: e.notes });
      case "error":
        ended = true;
        return hooks.fail(e.error);
    }
  };
  try {
    await readDraft(request, signal, onEvent);
    if (!ended) hooks.fail(DRAFT_CUT_OFF);
  } catch (err) {
    if (signal.aborted) hooks.update({ status: "stopped" });
    else hooks.fail(err instanceof Error ? err.message : String(err));
  }
}
