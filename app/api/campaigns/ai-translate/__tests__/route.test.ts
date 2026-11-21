import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODEL_ID } from "@/lib/ai/models";
import { resetRateLimits } from "@/lib/rate-limit";
import type { TranslateRequest } from "@/lib/email-campaigns/ai-translate-shape";
import { fakeClaude, userMessage, type FakeAnswer } from "@/lib/ai/__tests__/fake-claude";
import { TRANSLATE, translateAnswer, withWords } from "@/lib/email-campaigns/__tests__/ai-translate-fixtures";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  permissions: new Set<string>(["campaigns"]),
  tables: {} as Record<string, Record<string, unknown>[]>,
  reads: [] as string[],
  writes: [] as string[],
  hits: new Map<string, number>(),
  claude: null as unknown,
  audit: vi.fn(),
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

const post = (body: TranslateRequest | Record<string, unknown>) =>
  POST(new Request("http://x/api/campaigns/ai-translate", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

const setting = (key: string, value: string) => ({ key, value });
const CAMPAIGN_ID = "4f1c2b3a-1d2e-4f50-8a6b-7c8d9e0f1a2b";

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.permissions = new Set(["campaigns"]);
  h.tables = { site_settings: [], customers: [{ id: "c1", first_name: "Mei Ling", last_name: "Tan", email: "meiling.tan@example.com" }] };
  h.reads = [];
  h.writes = [];
  h.hits = new Map();
  h.campaign = null;
  useClaude([{ text: translateAnswer() }]);
});

describe("POST /api/campaigns/ai-translate", () => {
  it("checks the campaigns permission first, before anything is read or asked", async () => {
    h.permissions = new Set(["customers"]);
    const fake = useClaude([{ text: translateAnswer() }]);
    expect((await post(TRANSLATE)).status).toBe(403);
    expect(h.reads).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns the 中文 words, at the whole drafts effort: its one write is the email_campaign.ai_translate entry", async () => {
    h.campaign = { lockedAt: null };
    h.tables.site_settings = [setting("ai_writing_effort_draft", "high"), setting("ai_writing_effort_quick", "low")];
    const fake = useClaude([{ text: translateAnswer() }]);
    const res = await post({ ...TRANSLATE, campaignId: CAMPAIGN_ID });
    expect(res.status).toBe(200);
    const { translation } = await res.json();
    expect(Object.keys(translation.blocks).sort()).toEqual(["hero", "intro", "pair", "photo", "products", "split", "why"]);
    expect(translation.subject).toBe("{first_name}，这个十二月睡得更清凉");
    expect(fake.calls[0]).toMatchObject({ model: DEFAULT_AI_MODEL_ID, output_config: { effort: "high" } });
    expect(h.writes).toEqual([]);
    expect(h.sends).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledTimes(1);
    const [entry] = h.audit.mock.calls[0] as [{ action: string; entityId: string | null; after: Row }];
    expect(entry).toMatchObject({
      action: "email_campaign.ai_translate",
      entityId: CAMPAIGN_ID,
      after: { kind: "translate", model: DEFAULT_AI_MODEL_ID, input_tokens: 3000, output_tokens: 2000, ended: "translated", attempts: 1, scope: "email", blocks: 7, lines: true },
    });
    expect(JSON.stringify(entry.after)).not.toMatch(/FibreCool|Sleep|清凉/);
  });

  it("sends no customer to Claude, and no link: Staff's words alone", async () => {
    const fake = useClaude([{ text: translateAnswer() }]);
    await post(TRANSLATE);
    const sent = JSON.stringify(fake.calls[0]);
    for (const secret of ["Mei Ling", "meiling.tan@example.com", "c1"]) expect(sent).not.toContain(secret);
    expect(h.reads).not.toContain("customers");
    expect(userMessage(fake.calls[0])).not.toMatch(/https?:\/\//);
  });

  it("refuses a translation that drops a link with the block named, after auditing both attempts", async () => {
    const dropped = withWords("intro", () => ({ type: "text", paragraphs: [{ kind: "p", runs: [{ var: "first_name" }, { text: "，炎热的夜晚又来了。" }] }] }));
    useClaude([{ text: translateAnswer({ blocks: dropped }) }]);
    const res = await post(TRANSLATE);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/^Claude's translation didn't fit, so nothing was changed: Block 2, Text drops a link/);
    expect(h.audit.mock.calls[0][0]).toMatchObject({ after: { ended: "failed", attempts: 2, input_tokens: 6000 } });
  });

  it("never writes into a campaign that has started sending", async () => {
    h.campaign = { lockedAt: "2026-10-20T00:00:00Z" };
    const fake = useClaude([{ text: translateAnswer() }]);
    const res = await post({ ...TRANSLATE, campaignId: CAMPAIGN_ID });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Sending has started, so the email is fixed." });
    expect(fake.calls).toHaveLength(0);
  });

  it("is refused with AI writing switched off, or with nothing in English to translate, before Claude is asked", async () => {
    h.tables.site_settings = [setting("ai_writing_enabled", "false")];
    const fake = useClaude([{ text: translateAnswer() }]);
    expect((await post(TRANSLATE)).status).toBe(403);
    h.tables.site_settings = [];
    const empty = await post({ ...TRANSLATE, subject: "", content: { v: 1, blocks: [], fallbacks: {} } });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Write the email in English first, then Claude can translate it." });
    expect(fake.calls).toHaveLength(0);
  });

  it("counts toward the per-Staff limit, in its own words", async () => {
    h.tables.site_settings = [setting("ai_writing_limit_10min", "1")];
    expect((await post(TRANSLATE)).status).toBe(200);
    const fake = useClaude([{ text: translateAnswer() }]);
    const res = await post(TRANSLATE);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/^You've translated a lot today\. Try again after \d{1,2}:\d{2} (am|pm)( tomorrow)?\.$/);
    expect(fake.calls).toHaveLength(0);
  });
});
