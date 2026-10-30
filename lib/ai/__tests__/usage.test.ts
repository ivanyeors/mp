import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AI_MODEL_ID, aiModel } from "@/lib/ai/models";
import {
  AI_USAGE_ACTIONS,
  AI_WRITING_KINDS,
  aiUsageAuditEntry,
  aiUsageEntryFromAudit,
  aiUsageMonthStart,
  aiUsageSummaryLine,
  estimateAiUsage,
  formatUsageCost,
  readAiUsageThisMonth,
} from "@/lib/ai/usage";

/**
 * This month's AI writing use (PRD-campaign-email-editor slice 16), counted
 * from the `email_campaign.ai_*` audit entries slices 09, 10 and 17 write.
 */

const MODEL = DEFAULT_AI_MODEL_ID;

/** Audit rows as `admin_audit_log` holds them, written through the shared helper. */
const fixtureRows = [
  { action: "email_campaign.ai_draft", after: { ...aiUsageAuditEntry("draft", { model: MODEL, usage: { input_tokens: 3_000, output_tokens: 3_500 } }).after, kept: true } },
  { action: "email_campaign.ai_draft", after: { ...aiUsageAuditEntry("draft", { model: MODEL, usage: { input_tokens: 2_800, output_tokens: 4_100 } }).after, kept: false } },
  { action: "email_campaign.ai_translate", after: aiUsageAuditEntry("translate", { model: MODEL, usage: { input_tokens: 4_200, output_tokens: 3_900 } }).after },
  { action: "email_campaign.ai_subjects", after: aiUsageAuditEntry("subjects", { model: MODEL, usage: { input_tokens: 1_900, output_tokens: 600 } }).after },
  { action: "email_campaign.ai_preview_lines", after: aiUsageAuditEntry("preview_lines", { model: MODEL, usage: { input_tokens: 1_700, output_tokens: 300 } }).after },
  { action: "email_campaign.ai_rewrite", after: aiUsageAuditEntry("rewrite", { model: MODEL, usage: { input_tokens: 1_200, output_tokens: 450 } }).after },
  // Served by a fallback the list does not hold: counted, priced as the default.
  { action: "email_campaign.ai_rewrite", after: { kind: "rewrite", model: "a-fallback-model", input_tokens: 1_000, output_tokens: 500 } },
  // A call that ended without usage still counts as a call.
  { action: "email_campaign.ai_draft", after: { kind: "draft", model: MODEL } },
];

describe("the AI writing audit entry", () => {
  it("is one action per kind, with the serving model and token counts and nothing else", () => {
    expect(AI_USAGE_ACTIONS).toEqual(AI_WRITING_KINDS.map((k) => `email_campaign.ai_${k}`));
    expect(aiUsageAuditEntry("draft", { model: MODEL, usage: { input_tokens: 10, output_tokens: 20 } })).toEqual({
      action: "email_campaign.ai_draft",
      after: { kind: "draft", model: MODEL, input_tokens: 10, output_tokens: 20 },
    });
  });

  it("reads back what it wrote, and ignores other actions", () => {
    const { action, after } = aiUsageAuditEntry("subjects", { model: MODEL, usage: { input_tokens: 5, output_tokens: 7 } });
    expect(aiUsageEntryFromAudit({ action, after })).toEqual(after);
    expect(aiUsageEntryFromAudit({ action: "email_campaign.update", after })).toBeNull();
    expect(aiUsageEntryFromAudit({ action: "email_campaign.ai_draft", after: { input_tokens: -3, output_tokens: "12" } })).toEqual({
      kind: "draft",
      model: "",
      input_tokens: 0,
      output_tokens: 0,
    });
  });
});

describe("estimateAiUsage", () => {
  const entries = fixtureRows.map((r) => aiUsageEntryFromAudit(r)!);
  const usage = estimateAiUsage(entries);
  const price = aiModel(MODEL)!;

  it("equals the sum over the entries of tokens × the model's price", () => {
    const expected = entries.reduce(
      (sum, e) => sum + (e.input_tokens * price.inputPerMillionUsd + e.output_tokens * price.outputPerMillionUsd) / 1_000_000,
      0,
    );
    expect(usage.total.costUsd).toBeCloseTo(expected, 12);
    expect(usage.total.calls).toBe(8);
    expect(usage.total.inputTokens).toBe(15_800);
    expect(usage.total.outputTokens).toBe(13_350);
  });

  it("splits calls, tokens and cost by kind", () => {
    expect(usage.byKind.draft).toEqual({
      calls: 3,
      inputTokens: 5_800,
      outputTokens: 7_600,
      costUsd: expect.closeTo((5_800 * 4 + 7_600 * 20) / 1_000_000, 12),
    });
    expect(usage.byKind.translate.calls).toBe(1);
    expect(usage.byKind.rewrite).toMatchObject({ calls: 2, inputTokens: 2_200, outputTokens: 950 });
    const kindsTotal = AI_WRITING_KINDS.reduce((n, k) => n + usage.byKind[k].costUsd, 0);
    expect(kindsTotal).toBeCloseTo(usage.total.costUsd, 12);
  });

  it("counts the calls a model outside the list served", () => {
    expect(usage.unlistedModelCalls).toBe(1);
  });

  it("is nothing for no entries", () => {
    const none = estimateAiUsage([]);
    expect(none.total).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(aiUsageSummaryLine(none)).toBe("No AI writing calls yet this month.");
  });

  it("reads as drafts, translations and quick actions with the cost", () => {
    expect(aiUsageSummaryLine(usage)).toBe("3 drafts, 1 translation, 4 quick actions, about US$0.33");
    expect(formatUsageCost(3.4)).toBe("US$3.40");
    expect(formatUsageCost(0.001)).toBe("under US$0.01");
    expect(formatUsageCost(0)).toBe("US$0.00");
  });
});

describe("aiUsageMonthStart", () => {
  it("is midnight on the 1st in Singapore", () => {
    expect(aiUsageMonthStart(new Date("2026-10-29T09:00:00+08:00"))).toBe("2026-09-30T16:00:00.000Z");
    // 1 November, 3 am in Singapore, is still 31 October in UTC.
    expect(aiUsageMonthStart(new Date("2026-11-01T03:00:00+08:00"))).toBe("2026-10-31T16:00:00.000Z");
    expect(aiUsageMonthStart(new Date("2027-01-15T12:00:00+08:00"))).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("readAiUsageThisMonth", () => {
  function fakeAdmin(pages: { action: string; after: unknown }[][], error: { message: string } | null = null) {
    const calls: { method: string; args: unknown[] }[] = [];
    let page = 0;
    const query: Record<string, unknown> = {};
    for (const method of ["select", "in", "gte", "order"]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return query;
      };
    }
    query.range = vi.fn(async (...args: unknown[]) => {
      calls.push({ method: "range", args });
      return { data: error ? null : (pages[page++] ?? []), error };
    });
    const admin = { from: vi.fn(() => query) } as unknown as SupabaseClient;
    return { admin, calls };
  }

  it("counts this month's AI audit entries, a page at a time", async () => {
    const big = Array.from({ length: 1000 }, () => fixtureRows[3]);
    const { admin, calls } = fakeAdmin([big, fixtureRows.slice(0, 2)]);
    const usage = await readAiUsageThisMonth(admin, new Date("2026-10-29T09:00:00+08:00"));
    expect(usage.since).toBe("2026-09-30T16:00:00.000Z");
    expect(usage.byKind.subjects.calls).toBe(1000);
    expect(usage.byKind.draft.calls).toBe(2);
    expect(calls.find((c) => c.method === "in")?.args).toEqual(["action", [...AI_USAGE_ACTIONS]]);
    expect(calls.find((c) => c.method === "gte")?.args).toEqual(["created_at", "2026-09-30T16:00:00.000Z"]);
    expect(calls.filter((c) => c.method === "range").map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("throws on a failed read", async () => {
    const { admin } = fakeAdmin([], { message: "boom" });
    await expect(readAiUsageThisMonth(admin)).rejects.toThrow("Could not read this month's AI writing use: boom");
  });
});
