import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  candidateFromRow,
  compareSendOrder,
  planCampaignAudience,
  readCampaignCandidates,
  type CampaignCandidate,
} from "@/lib/customer-migration/audience";

const NOW = new Date("2026-10-21T04:00:00Z");

function candidate(id: string, over: Partial<CampaignCandidate> = {}): CampaignCandidate {
  return {
    customerId: id,
    email: `${id}@example.com`,
    firstName: null,
    locale: "en-US",
    migrated: true,
    claimedAt: null,
    marketingEmail: "subscribed",
    shopifyOrdersCount: 1,
    importedAt: "2026-10-10T00:00:00Z",
    sends: {},
    ...over,
  };
}

const sent = (wave: string, status: "sent" | "failed" | "pending" = "sent") => ({ status, wave, sentAt: "2026-10-12T00:00:00Z" });

describe("planCampaignAudience", () => {
  const list = [
    candidate("a-old-buyer", { importedAt: "2026-10-01T00:00:00Z", shopifyOrdersCount: 4 }),
    candidate("b-new-subscriber", { importedAt: "2026-10-20T00:00:00Z", shopifyOrdersCount: 0 }),
    candidate("c-new-buyer", { importedAt: "2026-10-15T00:00:00Z" }),
    candidate("d-old-subscriber", { importedAt: "2026-10-02T00:00:00Z", shopifyOrdersCount: 0 }),
    candidate("e-unsubscribed", { marketingEmail: "unsubscribed" }),
    candidate("f-no-consent", { marketingEmail: "not_subscribed" }),
    candidate("g-claimed", { claimedAt: "2026-10-18T00:00:00Z" }),
  ];

  it("orders buyers first, then the most recent import", () => {
    const plan = planCampaignAudience("migration_announcement", list, { wave: "w1", limit: 10 }, NOW);
    expect(plan.eligible.map((c) => c.customerId)).toEqual(["c-new-buyer", "a-old-buyer", "b-new-subscriber", "d-old-subscriber"]);
    expect(plan.eligibleBuyers).toBe(2);
    expect(plan.considered).toBe(7);
    expect(plan.excluded).toEqual({ unsubscribed: 1, not_subscribed: 1, claimed: 1 });
  });

  it("orders two runs the same way, by id at a tie", () => {
    const tie = [candidate("z"), candidate("m"), candidate("b")];
    expect([...tie].sort(compareSendOrder).map((c) => c.customerId)).toEqual(["b", "m", "z"]);
  });

  it("takes the first `limit`, and --buyers-only leaves out who never bought", () => {
    expect(planCampaignAudience("migration_announcement", list, { wave: "w1", limit: 3 }, NOW).selection.map((c) => c.customerId)).toEqual([
      "c-new-buyer",
      "a-old-buyer",
      "b-new-subscriber",
    ]);
    const buyers = planCampaignAudience("migration_announcement", list, { wave: "w1", limit: 10, buyersOnly: true }, NOW);
    expect(buyers.selection.map((c) => c.customerId)).toEqual(["c-new-buyer", "a-old-buyer"]);
    expect(buyers.excluded.not_a_buyer).toBe(2);
  });

  it("never selects the unsubscribed, nor the not-subscribed for an offer email", () => {
    for (const template of ["migration_announcement", "migration_reminder", "migration_service_notice"] as const) {
      const plan = planCampaignAudience(template, list, { wave: "w1", limit: 100, retryFailed: false }, NOW);
      expect(plan.eligible.map((c) => c.customerId)).not.toContain("e-unsubscribed");
      if (template !== "migration_service_notice") {
        expect(plan.eligible.map((c) => c.customerId)).not.toContain("f-no-consent");
      }
    }
    expect(
      planCampaignAudience("migration_service_notice", list, { wave: "n1", limit: 100 }, NOW).eligible.map((c) => c.customerId),
    ).toEqual(["f-no-consent"]);
  });

  it("counts what the wave already holds, so the same command twice sends nothing", () => {
    const after = list.map((c, i) => (i < 2 && c.marketingEmail === "subscribed" ? { ...c, sends: { migration_announcement: sent("w1") } } : c));
    const plan = planCampaignAudience("migration_announcement", after, { wave: "w1", limit: 2 }, NOW);
    expect(plan.alreadyInWave).toBe(2);
    expect(plan.room).toBe(0);
    expect(plan.selection).toEqual([]);
    expect(plan.eligible.map((c) => c.customerId)).toEqual(["c-new-buyer", "d-old-subscriber"]);
    expect(planCampaignAudience("migration_announcement", after, { wave: "w2", limit: 2 }, NOW).selection.map((c) => c.customerId)).toEqual([
      "c-new-buyer",
      "d-old-subscriber",
    ]);
  });

  it("a retry selects only this wave's failures, and adds nobody", () => {
    const after = [
      candidate("failed-w1", { sends: { migration_announcement: sent("w1", "failed") } }),
      candidate("failed-w2", { sends: { migration_announcement: sent("w2", "failed") } }),
      candidate("sent-w1", { sends: { migration_announcement: sent("w1") } }),
      candidate("never"),
    ];
    const plan = planCampaignAudience("migration_announcement", after, { wave: "w1", limit: 10, retryFailed: true }, NOW);
    expect(plan.selection.map((c) => c.customerId)).toEqual(["failed-w1"]);
    expect(plan.excluded).toEqual({ not_failed: 2, already_sent: 1 });
    expect(plan.room).toBe(10);
  });
});

describe("candidateFromRow", () => {
  it("reads the view's row, sends and all", () => {
    expect(
      candidateFromRow({
        customer_id: "c1",
        email: "a@x.test",
        first_name: "  Ann ",
        locale: "zh-CN",
        marketing_email: "subscribed",
        claimed_at: null,
        shopify_orders_count: "2",
        imported_at: "2026-10-10T00:00:00+00:00",
        sends: {
          migration_announcement: { status: "bounced", wave: "w1", sent_at: "2026-10-12T00:00:00+00:00", bounced: true, complained: false },
          junk: { status: "lost" },
        },
      }),
    ).toEqual({
      customerId: "c1",
      email: "a@x.test",
      firstName: "Ann",
      locale: "zh-CN",
      migrated: true,
      claimedAt: null,
      marketingEmail: "subscribed",
      shopifyOrdersCount: 2,
      importedAt: "2026-10-10T00:00:00+00:00",
      sends: { migration_announcement: { status: "bounced", wave: "w1", sentAt: "2026-10-12T00:00:00+00:00", bounced: true } },
    });
    expect(candidateFromRow({ customer_id: null, email: "x" })).toBeNull();
  });

  it("reads an unknown consent as nobody having asked", () => {
    expect(candidateFromRow({ customer_id: "c", email: "e@x.test", marketing_email: "maybe", sends: null })!.marketingEmail).toBe(
      "not_subscribed",
    );
  });
});

describe("readCampaignCandidates", () => {
  it("pages through the view 1,000 rows at a time, in a stable order", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({
      customer_id: `c${String(i).padStart(5, "0")}`,
      email: `c${i}@x.test`,
      marketing_email: "subscribed",
      imported_at: "2026-10-10T00:00:00Z",
      sends: {},
    }));
    const ranges: Array<[number, number]> = [];
    const order = vi.fn();
    const admin = {
      from: (table: string) => {
        expect(table).toBe("customer_campaign_candidates");
        const q = {
          select: () => q,
          order: (col: string, opts: unknown) => (order(col, opts), q),
          range: (a: number, b: number) => {
            ranges.push([a, b]);
            return Promise.resolve({ data: rows.slice(a, b + 1), error: null });
          },
        };
        return q;
      },
    } as unknown as SupabaseClient;
    const out = await readCampaignCandidates(admin);
    expect(out).toHaveLength(2345);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(order).toHaveBeenCalledWith("customer_id", { ascending: true });
  });

  it("throws on a failed read, so a wave never runs on half an audience", async () => {
    const admin = {
      from: () => {
        const q = { select: () => q, order: () => q, range: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
        return q;
      },
    } as unknown as SupabaseClient;
    await expect(readCampaignCandidates(admin)).rejects.toThrow(/boom/);
  });
});
