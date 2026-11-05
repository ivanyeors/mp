/**
 * What AI writing spends (PRD-campaign-email-editor slice 16; *Open*, D). Every
 * AI writing call (✨ Generate, slice 09; the refine actions, slice 10; ✨
 * Translate, slice 17; the product editor's ✨ Write and ✨ Generate SEO)
 * writes one audit entry (`email_campaign.ai_*`, or `product.ai_*`) carrying
 * the fields of {@link AiUsageEntry}, never the brief's text. General → AI
 * writing counts this month's entries and prices their tokens from the model
 * list: an estimate, since the Anthropic Console has the bill.
 *
 * The entry's shape lives here alone, so the slices that write it and the
 * read-out that counts it cannot drift apart.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AI_MODEL_ID, aiModel, tokenCostUsd, type AiModel } from "./models";

/**
 * The kinds of AI writing call. `draft` and `translate` are whole drafts, as
 * are a product's description and its SEO; the rest are quick actions. Each
 * has its own audit action ({@link aiUsageAction}).
 */
export const AI_WRITING_KINDS = ["draft", "translate", "subjects", "preview_lines", "rewrite", "product_description", "product_seo"] as const;
export type AiWritingKind = (typeof AI_WRITING_KINDS)[number];

/** Which effort setting a kind runs at: whole drafts or quick actions. */
export const AI_WRITING_KIND_EFFORT: Record<AiWritingKind, "draft" | "quick"> = {
  draft: "draft",
  translate: "draft",
  subjects: "quick",
  preview_lines: "quick",
  rewrite: "quick",
  product_description: "draft",
  product_seo: "draft",
};

export const AI_WRITING_KIND_LABEL: Record<AiWritingKind, string> = {
  draft: "Drafts",
  translate: "Translations",
  subjects: "Subject ideas",
  preview_lines: "Preview lines",
  rewrite: "Block rewrites",
  product_description: "Product descriptions",
  product_seo: "Product SEO",
};

/** The kinds the product editor asks for; the rest are a campaign's. */
type ProductAiKind = Extract<AiWritingKind, `product_${string}`>;

export type AiUsageAction =
  | `email_campaign.ai_${Exclude<AiWritingKind, ProductAiKind>}`
  | `product.ai_${ProductAiKind extends `product_${infer K}` ? K : never}`;

/** The audit action a call of `kind` writes: `email_campaign.ai_draft`, `product.ai_seo`. */
export const aiUsageAction = (kind: AiWritingKind): AiUsageAction =>
  (kind.startsWith("product_") ? `product.ai_${kind.slice("product_".length)}` : `email_campaign.ai_${kind}`) as AiUsageAction;

export const AI_USAGE_ACTIONS: readonly AiUsageAction[] = AI_WRITING_KINDS.map(aiUsageAction);

/** The token fields of an AI writing call's audit entry (its `after`). */
export interface AiUsageEntry {
  kind: AiWritingKind;
  /** The model that served the call (`message.model`): a server-side fallback can change it. */
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/**
 * The audit action and token fields for one AI writing call, from Claude's
 * final message. The caller adds its own facts (the campaign as the entity id,
 * whether the draft was kept) and passes both to `recordAdminAction`:
 *
 *   const { action, after } = aiUsageAuditEntry("draft", message);
 *   await recordAdminAction({ actor, action, entityType: "email_campaign", entityId, after: { ...after, kept } });
 */
export function aiUsageAuditEntry(
  kind: AiWritingKind,
  message: { model: string; usage: { input_tokens: number; output_tokens: number } },
): { action: AiUsageAction; after: AiUsageEntry } {
  return {
    action: aiUsageAction(kind),
    after: {
      kind,
      model: message.model,
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}

const tokens = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/**
 * Pure — an audit row as a usage entry, or null for a row that is not an AI
 * writing call. The kind comes from the action; tokens that are missing or
 * malformed count as none, so the call is still counted.
 */
export function aiUsageEntryFromAudit(row: { action: string; after: unknown }): AiUsageEntry | null {
  const kind = AI_WRITING_KINDS.find((k) => aiUsageAction(k) === row.action);
  if (!kind) return null;
  const after = (row.after && typeof row.after === "object" ? row.after : {}) as Record<string, unknown>;
  return {
    kind,
    model: typeof after.model === "string" ? after.model : "",
    input_tokens: tokens(after.input_tokens),
    output_tokens: tokens(after.output_tokens),
  };
}

export interface AiUsageLine {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** US$, unrounded. */
  costUsd: number;
}

export interface AiUsageEstimate {
  byKind: Record<AiWritingKind, AiUsageLine>;
  total: AiUsageLine;
  /** Calls served by a model not in the list, priced as the default model. */
  unlistedModelCalls: number;
}

const emptyLine = (): AiUsageLine => ({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });

/**
 * Pure — the calls, tokens and estimated cost of `entries`: each entry's
 * tokens × the list price of the model that served it. A model the list does
 * not hold (a fallback, a model since removed) is priced as the default model.
 */
export function estimateAiUsage(entries: readonly AiUsageEntry[]): AiUsageEstimate {
  const fallback = aiModel(DEFAULT_AI_MODEL_ID) as AiModel;
  const byKind = Object.fromEntries(AI_WRITING_KINDS.map((k) => [k, emptyLine()])) as Record<AiWritingKind, AiUsageLine>;
  const total = emptyLine();
  let unlistedModelCalls = 0;
  for (const entry of entries) {
    const model = aiModel(entry.model);
    if (!model) unlistedModelCalls += 1;
    const cost = tokenCostUsd(model ?? fallback, entry.input_tokens, entry.output_tokens);
    for (const line of [byKind[entry.kind], total]) {
      line.calls += 1;
      line.inputTokens += entry.input_tokens;
      line.outputTokens += entry.output_tokens;
      line.costUsd += cost;
    }
  }
  return { byKind, total, unlistedModelCalls };
}

/** Pure — an estimate in US$ as the read-out shows it. */
export function formatUsageCost(usd: number): string {
  if (usd > 0 && usd < 0.005) return "under US$0.01";
  return `US$${usd.toFixed(2)}`;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-SG")} ${n === 1 ? one : many}`;

/** Pure — the month in one line: "38 drafts, 51 quick actions, 6 product texts, about US$3.40". */
export function aiUsageSummaryLine(usage: AiUsageEstimate): string {
  if (usage.total.calls === 0) return "No AI writing calls yet this month.";
  const quick = AI_WRITING_KINDS.filter((k) => AI_WRITING_KIND_EFFORT[k] === "quick").reduce((n, k) => n + usage.byKind[k].calls, 0);
  const product = usage.byKind.product_description.calls + usage.byKind.product_seo.calls;
  const parts = [
    count(usage.byKind.draft.calls, "draft", "drafts"),
    ...(usage.byKind.translate.calls ? [count(usage.byKind.translate.calls, "translation", "translations")] : []),
    count(quick, "quick action", "quick actions"),
    ...(product ? [count(product, "product text", "product texts")] : []),
  ];
  const cost = formatUsageCost(usage.total.costUsd);
  return `${parts.join(", ")}, ${cost.startsWith("under") ? cost : `about ${cost}`}`;
}

/** Pure — midnight on the 1st of `now`'s month in Singapore (UTC+8, no daylight saving), as an ISO instant. */
export function aiUsageMonthStart(now: Date): string {
  const sgt = new Date(now.getTime() + 8 * 3_600_000);
  return new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), 1) - 8 * 3_600_000).toISOString();
}

export interface AiUsageThisMonth extends AiUsageEstimate {
  /** The start of the month counted, an ISO instant. */
  since: string;
}

const PAGE_ROWS = 1000;

/** This month's AI writing calls, from the audit log. Throws on a failed read. */
export async function readAiUsageThisMonth(admin: SupabaseClient, now: Date = new Date()): Promise<AiUsageThisMonth> {
  const since = aiUsageMonthStart(now);
  const entries: AiUsageEntry[] = [];
  // A page at a time, so no call is dropped at PostgREST's row limit.
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await admin
      .from("admin_audit_log")
      .select("action, after")
      .in("action", [...AI_USAGE_ACTIONS])
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`Could not read this month's AI writing use: ${error.message}`);
    const rows = (data ?? []) as { action: string; after: unknown }[];
    for (const row of rows) {
      const entry = aiUsageEntryFromAudit(row);
      if (entry) entries.push(entry);
    }
    if (rows.length < PAGE_ROWS) break;
  }
  return { since, ...estimateAiUsage(entries) };
}
