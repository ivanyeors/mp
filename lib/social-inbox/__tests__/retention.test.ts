import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/reviews/__tests__/fake-supabase";

/**
 * Customer messages are kept for a year. A conversation nobody has written in
 * for a year goes with its messages; a conversation that is still going loses
 * only its messages from before then.
 */

const h = vi.hoisted(() => ({ db: null as unknown, tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));

const { purgeOldSocialMessages, retentionCutoff, SOCIAL_INBOX_RETENTION_DAYS } = await import(
  "@/lib/social-inbox/retention"
);

const NOW = new Date("2026-11-02T03:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const ids = (table: string) => (h.tables[table] as Row[]).map((r) => r.id);

beforeEach(() => {
  h.tables = {
    social_conversations: [
      // Quiet for 13 months.
      { id: "c-quiet", platform: "instagram", created_at: daysAgo(500), updated_at: daysAgo(400) },
      // Started long ago, wrote again last month.
      { id: "c-going", platform: "tiktok", created_at: daysAgo(500), updated_at: daysAgo(30) },
    ],
    social_messages: [
      { id: "m-quiet", conversation_id: "c-quiet", platform: "instagram", created_at: daysAgo(400) },
      { id: "m-going-old", conversation_id: "c-going", platform: "tiktok", created_at: daysAgo(480) },
      { id: "m-going-new", conversation_id: "c-going", platform: "tiktok", created_at: daysAgo(30) },
      { id: "m-edge", conversation_id: "c-going", platform: "tiktok", created_at: daysAgo(SOCIAL_INBOX_RETENTION_DAYS - 1) },
    ],
  };
  h.db = createFakeSupabase(h.tables);
});

describe("purgeOldSocialMessages", () => {
  it("cuts off exactly a year back", () => {
    expect(retentionCutoff(NOW)).toBe(daysAgo(365));
  });

  it("deletes quiet conversations and messages older than a year, and keeps the rest", async () => {
    await purgeOldSocialMessages(NOW);
    expect(ids("social_conversations")).toEqual(["c-going"]);
    expect(ids("social_messages")).toEqual(["m-going-new", "m-edge"]);
  });

  it("does nothing when everything is recent", async () => {
    await purgeOldSocialMessages(new Date(daysAgo(300)));
    expect(ids("social_conversations")).toEqual(["c-quiet", "c-going"]);
    expect(ids("social_messages")).toHaveLength(4);
  });
});
