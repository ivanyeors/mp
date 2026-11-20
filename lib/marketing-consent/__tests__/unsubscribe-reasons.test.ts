import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UNSUBSCRIBE_REASONS,
  UNSUBSCRIBE_REASON_AREA,
  UNSUBSCRIBE_REASON_LABEL,
  UNSUBSCRIBE_REASON_OUTCOMES,
  unsubscribeAskOrder,
} from "../unsubscribe-reasons";
import { UnsubscribeAnswerSchema, summariseUnsubscribes } from "../unsubscribe-reasons-server";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261101081458_unsubscribe_reasons.sql"), "utf8");

describe("the answers", () => {
  it("are the table's, every one labelled and pointing somewhere", () => {
    for (const r of UNSUBSCRIBE_REASONS) {
      expect(MIGRATION).toContain(`'${r}'`);
      expect(UNSUBSCRIBE_REASON_LABEL[r]).toBeTruthy();
      expect(UNSUBSCRIBE_REASON_AREA[r]).toBeTruthy();
    }
    for (const o of UNSUBSCRIBE_REASON_OUTCOMES) expect(MIGRATION).toContain(`'${o}'`);
  });

  it("never offer a discount or ask them to stay", () => {
    for (const label of Object.values(UNSUBSCRIBE_REASON_LABEL)) expect(label).not.toMatch(/discount|offer|stay|% off|\$/i);
  });
});

describe("unsubscribeAskOrder", () => {
  it("asks every answer once, Other last, shuffled", () => {
    const seq = [0.9, 0.1, 0.5, 0.3, 0.7];
    let i = 0;
    const order = unsubscribeAskOrder(() => seq[i++ % seq.length]!);
    expect(order).toHaveLength(UNSUBSCRIBE_REASONS.length);
    expect(new Set(order)).toEqual(new Set(UNSUBSCRIBE_REASONS));
    expect(order.at(-1)).toBe("other");
    expect(unsubscribeAskOrder(() => 0).at(-1)).toBe("other");
    expect(unsubscribeAskOrder(() => 0)).not.toEqual(unsubscribeAskOrder(() => 0.99));
  });
});

describe("UnsubscribeAnswerSchema", () => {
  it("keeps words with Other alone, trimmed, up to 500 characters", () => {
    expect(UnsubscribeAnswerSchema.parse({ reason: "other", text: "  Moving  " })).toEqual({ reason: "other", text: "Moving" });
    expect(UnsubscribeAnswerSchema.parse({ reason: "other", text: "   " })).toEqual({ reason: "other", text: null });
    expect(UnsubscribeAnswerSchema.parse({ reason: "too_many", text: "dropped" })).toEqual({ reason: "too_many", text: null });
    expect(UnsubscribeAnswerSchema.safeParse({ reason: "other", text: "x".repeat(501) }).success).toBe(false);
    expect(UnsubscribeAnswerSchema.safeParse({ reason: "discount" }).success).toBe(false);
  });
});

describe("summariseUnsubscribes", () => {
  it("counts every unsubscribe by how, and the answers by reason, most given first", () => {
    const s = summariseUnsubscribes(
      [{ source: "unsubscribe_link" }, { source: "unsubscribe_link" }, { source: "account" }, { source: "complaint" }, { source: "support" }],
      [
        { reason: "too_many", other_text: null, created_at: "2026-10-30T00:00:00Z" },
        { reason: "other", other_text: "Moving", created_at: "2026-10-31T00:00:00Z" },
        { reason: "too_many", other_text: null, created_at: "2026-10-29T00:00:00Z" },
        { reason: "nonsense", other_text: null, created_at: "2026-10-29T00:00:00Z" },
      ],
      30,
    );
    expect(s.unsubscribes).toEqual({ total: 5, link: 2, account: 1, support: 1, complaint: 1, other: 0 });
    expect(s.answers).toBe(3);
    expect(s.byReason).toEqual([
      { reason: "too_many", count: 2 },
      { reason: "other", count: 1 },
    ]);
    expect(s.latestText).toEqual([{ reason: "other", text: "Moving", at: "2026-10-31T00:00:00Z" }]);
  });
});
