import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODEL_ID } from "@/lib/ai/models";
import { resetRateLimits } from "@/lib/rate-limit";
import type { DraftEvent, DraftRequest } from "@/lib/email-campaigns/ai-draft-shape";
import { fakeClaude, userMessage, type FakeAnswer } from "@/lib/ai/__tests__/fake-claude";
import { COVER_ID, REQUEST, draftAnswer } from "@/lib/email-campaigns/__tests__/ai-draft-fixtures";

/**
 * ✨ Generate's route (PRD-campaign-email-editor slice 09): `campaigns`
 * first, the AI writing settings read at the call, the per-Staff limits, then
 * Claude, streamed back to the editor. It returns blocks and ideas, and
 * writes nothing but its audit entry: never a campaign, never `content`,
 * never a send.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  permissions: new Set<string>(["campaigns"]),
  tables: {} as Record<string, Record<string, unknown>[]>,
  reads: [] as string[],
  writes: [] as string[],
  hits: new Map<string, number>(),
  claude: null as unknown,
  audit: vi.fn(),
  cards: [] as { id: string; title: string | null; photoUrl: null; price: null; listed: boolean }[],
  campaign: null as { lockedAt: string | null } | null,
  sends: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "member-1", userId: "u1", email: "staff@example.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));

/** The service-role client: reads from `h.tables`, counts `rate_limit_hit`, and records every write. */
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = [...(h.tables[table] ?? [])];
      const write = () => {
        h.writes.push(table);
        return Promise.resolve({ data: null, error: null });
      };
      const q = {
        select: () => {
          h.reads.push(table);
          return q;
        },
        in: (col: string, values: unknown[]) => {
          rows = rows.filter((r) => values.includes(r[col]));
          return q;
        },
        eq: (col: string, value: unknown) => {
          rows = rows.filter((r) => r[col] === value);
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, fail),
        insert: write,
        update: write,
        upsert: write,
        delete: write,
      };
      return q;
    },
    async rpc(name: string, args: Row) {
      if (name !== "rate_limit_hit") throw new Error(`fake: no rpc ${name}`);
      const key = `${args.p_bucket}:${args.p_key}`;
      const n = (h.hits.get(key) ?? 0) + 1;
      h.hits.set(key, n);
      return { data: n > Number(args.p_max), error: null };
    },
  }),
}));
vi.mock("@/lib/ai/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/claude")>()),
  claudeClient: () => h.claude,
}));
vi.mock("@/lib/email-campaigns/products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/products")>()),
  readCampaignProductCards: vi.fn(async (_: unknown, ids: string[]) => h.cards.filter((c) => ids.includes(c.id))),
}));
// Nothing here may save, lock or send: each is a spy that must stay uncalled.
vi.mock("@/lib/email-campaigns/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/store")>()),
  getCampaign: vi.fn(async () => h.campaign),
  createCampaign: h.sends,
  updateCampaign: h.sends,
  lockCampaign: h.sends,
}));
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/sender")>()),
  sendCampaignBatch: h.sends,
  sendCampaignTest: h.sends,
  planWave: h.sends,
}));

const { POST } = await import("../route");

function useClaude(answers: FakeAnswer[]) {
  const fake = fakeClaude(answers);
  h.claude = fake.client;
  return fake;
}

const post = (over: Partial<DraftRequest> = {}) =>
  POST(new Request("http://x/api/campaigns/ai-draft", { method: "POST", body: JSON.stringify({ ...REQUEST, ...over }), headers: { "Content-Type": "application/json" } }));

async function events(res: Response): Promise<DraftEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DraftEvent);
}

const setting = (key: string, value: string) => ({ key, value });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.permissions = new Set(["campaigns"]);
  h.tables = {
    site_settings: [],
    customers: [{ id: "c1", first_name: "Mei Ling", last_name: "Tan", email: "meiling.tan@example.com" }],
    orders: [{ id: "o1", order_number: "MP-10421", customer_id: "c1" }],
  };
  h.reads = [];
  h.writes = [];
  h.hits = new Map();
  h.cards = [];
  h.campaign = null;
  useClaude([{ text: draftAnswer() }]);
});

describe("POST /api/campaigns/ai-draft", () => {
  it("checks the campaigns permission first, before anything is read or asked", async () => {
    h.permissions = new Set(["customers"]);
    const fake = useClaude([{ text: draftAnswer() }]);
    const res = await post();
    expect(res.status).toBe(403);
    expect(h.reads).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("streams the blocks and the ideas, then done: it returns blocks and nothing else", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const got = await events(res);
    expect(got.map((e) => e.type)).toEqual(["stage", "subjects", "preheaders", "block", "block", "block", "done"]);
    expect(new Set(got.map((e) => e.type))).toEqual(new Set(["stage", "subjects", "preheaders", "block", "done"]));
    expect(got.at(-1)).toEqual({ type: "done", draftId: expect.stringMatching(/^[0-9a-f-]{36}$/), notes: ["Add the photo of the cover if you have one."] });
  });

  it("never saves the campaign, writes content or reaches a send: its one write is the audit entry", async () => {
    h.campaign = { lockedAt: null };
    await events(await post({ campaignId: "4f1c2b3a-1d2e-4f50-8a6b-7c8d9e0f1a2b" }));
    expect(h.writes).toEqual([]);
    expect(h.sends).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledTimes(1);
    const [entry] = h.audit.mock.calls[0] as [{ action: string; entityType: string; entityId: string | null; after: Row }];
    expect(entry).toMatchObject({
      action: "email_campaign.ai_draft",
      entityType: "email_campaign",
      entityId: "4f1c2b3a-1d2e-4f50-8a6b-7c8d9e0f1a2b",
      after: { kind: "draft", model: DEFAULT_AI_MODEL_ID, input_tokens: 3000, output_tokens: 2000, kept: false, ended: "drafted", blocks: 3, attempts: 1 },
    });
    // Never the brief's text.
    expect(JSON.stringify(entry.after)).not.toContain("keeps the pillow cool");
  });

  it("sends no customer's name, email or order to Claude: the built request holds the brief alone", async () => {
    const fake = useClaude([{ text: draftAnswer() }]);
    await events(await post());
    const sent = JSON.stringify(fake.calls[0]);
    for (const secret of ["Mei Ling", "Tan", "meiling.tan@example.com", "MP-10421", "c1"]) expect(sent).not.toContain(secret);
    expect(h.reads).not.toContain("customers");
    expect(h.reads).not.toContain("orders");
    expect(userMessage(fake.calls[0])).toContain(REQUEST.about);
  });

  it("asks with the settings read at the call: a changed model or effort is the next call's", async () => {
    let fake = useClaude([{ text: draftAnswer() }]);
    await events(await post());
    expect(fake.calls[0]).toMatchObject({ model: DEFAULT_AI_MODEL_ID, output_config: { effort: "medium" } });
    h.tables.site_settings = [setting("ai_writing_effort_draft", "high")];
    fake = useClaude([{ text: draftAnswer() }]);
    await events(await post());
    expect(fake.calls[0]).toMatchObject({ output_config: { effort: "high" } });
  });

  it("is refused with AI writing switched off, before Claude is asked", async () => {
    h.tables.site_settings = [setting("ai_writing_enabled", "false")];
    const fake = useClaude([{ text: draftAnswer() }]);
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "AI writing is switched off on General." });
    expect(fake.calls).toHaveLength(0);
  });

  it("says how to set Claude up when the credentials aren't there", async () => {
    h.claude = null;
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI writing is off: add the Claude API key on General" });
  });

  it("past the per-10-minute limit, refuses the next call with the time it can run again", async () => {
    h.tables.site_settings = [setting("ai_writing_limit_10min", "2")];
    const fake = useClaude([{ text: draftAnswer() }]);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    const res = await post();
    expect(res.status).toBe(429);
    // From 15:50 to 16:00 UTC the ten minutes end at midnight in Singapore: "12:00 am tomorrow".
    expect((await res.json()).error).toMatch(/^You've drafted a lot today\. Try again after \d{1,2}:\d{2} (am|pm)( tomorrow)?\.$/);
    expect(fake.calls).toHaveLength(2);
  });

  it("needs a subject (or name) of 3 words", async () => {
    const res = await post({ subject: "Sleep cooler", name: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Write a subject of at least 3 words, then Claude can draft the email from it.");
  });

  it("never writes into a campaign that has started sending", async () => {
    h.campaign = { lockedAt: "2026-10-20T00:00:00Z" };
    const fake = useClaude([{ text: draftAnswer() }]);
    const res = await post({ campaignId: "4f1c2b3a-1d2e-4f50-8a6b-7c8d9e0f1a2b" });
    expect(res.status).toBe(409);
    expect(fake.calls).toHaveLength(0);
  });

  it("takes only Listed products, and hands Claude their names", async () => {
    h.cards = [{ id: COVER_ID, title: "FibreCool cover", photoUrl: null, price: null, listed: false }];
    expect((await post({ products: [COVER_ID] })).status).toBe(400);
    h.cards[0].listed = true;
    const fake = useClaude([{ text: draftAnswer() }]);
    await events(await post({ products: [COVER_ID] }));
    expect(userMessage(fake.calls[0])).toContain("FibreCool cover");
  });

  it("reports a draft that failed its checks twice, after auditing both attempts", async () => {
    const offer = [{ type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Now 30% off." }] }] }];
    useClaude([{ text: draftAnswer({ blocks: offer }) }]);
    const got = await events(await post());
    expect(got.at(-1)).toMatchObject({ type: "error", error: expect.stringMatching(/^Claude's draft didn't fit the email/) });
    expect(h.audit.mock.calls[0][0]).toMatchObject({ after: { ended: "failed", attempts: 2, input_tokens: 6000 } });
  });
});
