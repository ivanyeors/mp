import type { TranslateRequest } from "@/lib/email-campaigns/ai-translate-shape";
import { chineseGaps, chineseLinesStatus, chineseVersionOf, type ChineseTranslation } from "@/lib/email-campaigns/chinese-version";
import type { EditorDraft } from "../kept-draft";

export type TranslateScope = { kind: "all" } | { kind: "changed" } | { kind: "block"; id: string };

export function translateRequest(draft: EditorDraft, scope: TranslateScope, { campaignId }: { campaignId: string | null }): TranslateRequest | null {
  const content = draft.content;
  if (!content) return null;
  const base = { campaignId, subject: draft.subject, preheader: draft.preheader, content };
  if (scope.kind === "all") return { ...base, only: null, lines: true };
  if (scope.kind === "block") return { ...base, only: [scope.id], lines: false };
  const only = chineseGaps(content).map((g) => g.id);
  const lines = chineseLinesStatus(chineseVersionOf(content), draft.subject, draft.preheader) !== "current";
  return only.length || lines ? { ...base, only, lines } : null;
}

export async function runTranslate(request: TranslateRequest, signal: AbortSignal): Promise<ChineseTranslation> {
  const res = await fetch("/api/campaigns/ai-translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const answer = (await res.json().catch(() => null)) as { translation?: ChineseTranslation; error?: string } | null;
  if (!res.ok || !answer?.translation) throw new Error(answer?.error || `Claude couldn't translate it (${res.status}). Try again.`);
  return answer.translation;
}
