import { DRAFT_LIMITS } from "@/lib/email-campaigns/ai-draft-brief";
import type { IdeasKind, RefineKind, RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import { REFINE_LIMITS, rewriteWords, type RefineRequest, type RefineResult, type RewriteAction } from "@/lib/email-campaigns/ai-refine-shape";
import { contentWords } from "@/lib/email-campaigns/content";
import type { EditorDraft } from "../kept-draft";
import { IDEAS_KIND, unchanged, type IdeasField, type RefineState, type RefineStore, type RewriteOffer } from "./refine-state";

/**
 * ✨ Refine's asks in the browser (PRD-campaign-email-editor slice 10): the
 * request, from the email as the editor holds it now (Staff's words, never a
 * customer's), POSTed to /api/campaigns/ai-refine, and what its answer does
 * to the editor's ✨ Refine state (refine-state.ts). Loaded with the first
 * ask, not with the page.
 */

/** The email's words for ideas to be written from, as many as the route takes. */
function emailWords(draft: EditorDraft): string[] {
  const out: string[] = [];
  let size = 0;
  for (const w of draft.content ? contentWords(draft.content) : []) {
    const words = w.trim();
    if (!words) continue;
    size += words.length + 1;
    if (size > DRAFT_LIMITS.existing) break;
    out.push(words);
  }
  return out;
}

/** Subject line or preview line ideas for the email; `exclude` the ideas already shown. */
export function ideasRequest(kind: IdeasKind, draft: EditorDraft, { campaignId, exclude }: { campaignId: string | null; exclude: readonly string[] }): RefineRequest {
  return { kind, campaignId, subject: draft.subject, preheader: draft.preheader, name: draft.name, words: emailWords(draft), exclude: [...exclude] };
}

/** A rewrite of `block`; `previous` the rewrites already offered for it. */
export function rewriteRequest(
  block: RewritableBlock,
  { action, instruction, previous }: { action: RewriteAction; instruction: string; previous: readonly RewritableBlock[] },
  draft: EditorDraft,
  { campaignId }: { campaignId: string | null },
): RefineRequest {
  return { kind: "rewrite", campaignId, subject: draft.subject, name: draft.name, block, action, instruction: action === "other" ? instruction : "", exclude: previous.map(rewriteWords) };
}

/** POSTs the ask; its answer, or it throws the words to show (a limit, a refusal, a failed check). */
export async function runRefine(request: RefineRequest, signal: AbortSignal): Promise<RefineResult> {
  const res = await fetch("/api/campaigns/ai-refine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const answer = (await res.json().catch(() => null)) as RefineResult | { error?: string } | null;
  if (!res.ok || !answer || !("kind" in answer)) throw new Error((answer && "error" in answer && answer.error) || `Claude couldn't answer (${res.status}). Try again.`);
  return answer;
}

type Answer = { result: RefineResult } | { error: string } | null;

/** Runs one ask as the one running now; its answer, or null when it was stopped. */
async function ask(store: RefineStore, kind: RefineKind, request: RefineRequest): Promise<Answer> {
  const controller = new AbortController();
  store.live.current = controller;
  store.update((s) => ({ ...s, working: kind }));
  try {
    return { result: await runRefine(request, controller.signal) };
  } catch (err) {
    return controller.signal.aborted ? null : { error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (store.live.current === controller) store.live.current = null;
    store.update((s) => ({ ...s, working: null }));
  }
}

/** Ideas for `field`; `more` asks for others than those shown, which stay in view meanwhile. */
export async function suggest(store: RefineStore, field: IdeasField, { more = false }: { more?: boolean } = {}): Promise<void> {
  if (store.live.current) return;
  const kind = IDEAS_KIND[field];
  const before = store.state().ideas[field];
  const shown = more ? (before?.shown ?? []) : [];
  const set = (fn: (at: RefineState["ideas"][IdeasField]) => RefineState["ideas"][IdeasField]) => store.update((s) => ({ ...s, ideas: { ...s.ideas, [field]: fn(s.ideas[field]) } }));
  set(() => ({ status: "working", ideas: more ? (before?.ideas ?? []) : [], error: null, shown }));
  const answer = await ask(store, kind, ideasRequest(kind, store.history().value, { campaignId: store.campaignId, exclude: shown }));
  set((at) => {
    // Dismissed meanwhile, or stopped: what was shown before stays.
    if (!at || at.status !== "working") return at;
    if (!answer) return at.ideas.length ? { ...at, status: "ready" } : null;
    if ("error" in answer) return { ...at, status: "failed", error: answer.error };
    const got = answer.result.kind === "rewrite" ? [] : answer.result.ideas;
    return { status: "ready", ideas: got, error: null, shown: [...shown, ...got].slice(-REFINE_LIMITS.exclude) };
  });
}

/** A rewrite of `block`, offered beside it once it arrives, while the block is still as it was. */
export async function rewrite(store: RefineStore, block: RewritableBlock, action: RewriteAction, instruction = "", shown: RewritableBlock[] = []): Promise<void> {
  if (store.live.current) return;
  const asked: RewriteOffer = { blockId: block.id, action, instruction, status: "working", original: block, proposal: null, error: null, shown };
  store.update((s) => ({ ...s, rewriting: asked }));
  const answer = await ask(store, "rewrite", rewriteRequest(block, { action, instruction, previous: shown }, store.history().value, { campaignId: store.campaignId }));
  store.update((s) => {
    const o = s.rewriting;
    // Kept, replaced or gone stale meanwhile: nothing to offer.
    if (o !== asked) return s;
    if (!answer || !unchanged(store.history().value.content, block)) return { ...s, rewriting: null };
    if ("error" in answer) return { ...s, rewriting: { ...o, status: "failed", error: answer.error } };
    return { ...s, rewriting: answer.result.kind === "rewrite" ? { ...o, status: "ready", proposal: answer.result.block } : null };
  });
}

/** *Try again*: the same ask, for a rewrite other than those offered. */
export async function tryAgain(store: RefineStore): Promise<void> {
  const o = store.state().rewriting;
  if (!o || o.status === "working") return;
  store.update((s) => ({ ...s, rewriting: null }));
  await rewrite(store, o.original, o.action, o.instruction, o.proposal ? [...o.shown, o.proposal].slice(-3) : o.shown);
}
