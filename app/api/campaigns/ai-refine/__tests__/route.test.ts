import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODEL_ID } from "@/lib/ai/models";
import { resetRateLimits } from "@/lib/rate-limit";
import type { RefineRequest } from "@/lib/email-campaigns/ai-refine-shape";
import { fakeClaude, userMessage, type FakeAnswer } from "@/lib/ai/__tests__/fake-claude";
import { draftAnswer, REQUEST } from "@/lib/email-campaigns/__tests__/ai-draft-fixtures";
import { FITTING_URL, FIVE_SUBJECTS, PREVIEW_LINES, REWRITE, SHORTER_TEXT, SUBJECTS, previewAnswer, subjectsAnswer } from "@/lib/email-campaigns/__tests__/ai-refine-fixtures";

/**
 * ✨ Refine's route (PRD-campaign-email-editor slice 10): `campaigns` first,
 * the AI writing settings read at the call, the per-Staff limits it shares
 * with ✨ Generate, then Claude at the quick actions effort. It returns
 * ideas or a rewritten block and writes nothing but its audit entry: never a
 * campaign, never `content`, never a send.
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
const draft = (await import("../../ai-draft/route")).POST;

function useClaude(answers: FakeAnswer[]) {
  const fake = fakeClaude(answers);
  h.claude = fake.client;
  return fake;
}

const post = (body: RefineRequest | Record<string, unknown>) =>
  POST(new Request("http://x/api/campaigns/ai-refine", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

const setting = (key: string, value: string) => ({ key, value });
const CAMPAIGN_ID = "4f1c2b3a-1d2e-4f50-8a6b-7c8d9e0f1a2b";

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
  h.campaign = null;
  useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
});

describe("POST /api/campaigns/ai-refine", () => {
  it("checks the campaigns permission first, before anything is read or asked", async () => {
    h.permissions = new Set(["customers"]);
    const fake = useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    const res = await post(SUBJECTS);
    expect(res.status).toBe(403);
    expect(h.reads).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns five subject lines, and nothing else: its one write is the audit entry", async () => {
    h.campaign = { lockedAt: null };
    const res = await post({ ...SUBJECTS, campaignId: CAMPAIGN_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "subjects", ideas: FIVE_SUBJECTS });
    expect(h.writes).toEqual([]);
    expect(h.sends).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledTimes(1);
    const [entry] = h.audit.mock.calls[0] as [{ action: string; entityType: string; entityId: string | null; after: Row }];
    expect(entry).toMatchObject({
      action: "email_campaign.ai_subjects",
      entityType: "email_campaign",
      entityId: CAMPAIGN_ID,
      after: { kind: "subjects", model: DEFAULT_AI_MODEL_ID, input_tokens: 3000, output_tokens: 2000, ended: "suggested", attempts: 1, ideas: 5, more: false },
    });
    // Never the email's words, nor Claude's.
    expect(JSON.stringify(entry.after)).not.toMatch(/FibreCool|Sleep cooler/);
  });

  it("writes preview lines and rewrites under their own audit kinds", async () => {
    useClaude([{ text: previewAnswer(["The FibreCool cover keeps your pillow cool on warm nights.", "Back in every size, for warm nights."]) }]);
    expect(await (await post(PREVIEW_LINES)).json()).toMatchObject({ kind: "preview_lines", ideas: expect.any(Array) });
    useClaude([{ text: JSON.stringify(SHORTER_TEXT) }]);
    const res = await post(REWRITE);
    expect(await res.json()).toMatchObject({ kind: "rewrite", block: { id: "t1", type: "text", paragraphs: [{}, { runs: [{ href: FITTING_URL }, {}] }] } });
    expect(h.audit.mock.calls.map(([e]) => (e as { action: string }).action)).toEqual(["email_campaign.ai_preview_lines", "email_campaign.ai_rewrite"]);
    expect(h.audit.mock.calls[1][0]).toMatchObject({ after: { kind: "rewrite", rewrite: "shorter", block_type: "text", ended: "suggested" } });
  });

  it("asks at the quick actions effort read at the call: a change there is the next call's", async () => {
    let fake = useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    await post(SUBJECTS);
    expect(fake.calls[0]).toMatchObject({ model: DEFAULT_AI_MODEL_ID, output_config: { effort: "low" } });
    h.tables.site_settings = [setting("ai_writing_effort_quick", "medium"), setting("ai_writing_effort_draft", "high")];
    fake = useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    await post(SUBJECTS);
    expect(fake.calls[0]).toMatchObject({ output_config: { effort: "medium" } });
  });

  it("sends no customer's name, email or order to Claude: the built request holds Staff's words alone", async () => {
    const fake = useClaude([{ text: JSON.stringify(SHORTER_TEXT) }]);
    await post(REWRITE);
    const sent = JSON.stringify(fake.calls[0]);
    for (const secret of ["Mei Ling", "Tan", "meiling.tan@example.com", "MP-10421", "c1"]) expect(sent).not.toContain(secret);
    expect(h.reads).not.toContain("customers");
    expect(h.reads).not.toContain("orders");
    expect(userMessage(fake.calls[0])).toContain("Book a fitting");
  });

  it("is refused with AI writing switched off, or without credentials, before Claude is asked", async () => {
    h.tables.site_settings = [setting("ai_writing_enabled", "false")];
    const fake = useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    const off = await post(SUBJECTS);
    expect(off.status).toBe(403);
    expect(await off.json()).toEqual({ error: "AI writing is switched off on General." });
    h.tables.site_settings = [];
    h.claude = null;
    const unset = await post(SUBJECTS);
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ error: "AI writing is off: add the Claude API key on General" });
    expect(fake.calls).toHaveLength(0);
  });

  it("counts toward the same per-Staff limit as ✨ Generate, one each, and says when to try again", async () => {
    h.tables.site_settings = [setting("ai_writing_limit_10min", "3")];
    useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    expect((await post(SUBJECTS)).status).toBe(200);
    useClaude([{ text: draftAnswer() }]);
    const drafted = await draft(new Request("http://x/api/campaigns/ai-draft", { method: "POST", body: JSON.stringify(REQUEST) }));
    expect(drafted.status).toBe(200);
    await drafted.text();
    useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    expect((await post(SUBJECTS)).status).toBe(200);
    const fake = useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    const res = await post(SUBJECTS);
    expect(res.status).toBe(429);
    // From 15:50 to 16:00 UTC the ten minutes end at midnight in Singapore: "12:00 am tomorrow".
    expect((await res.json()).error).toMatch(/^You've asked Claude for a lot today\. Try again after \d{1,2}:\d{2} (am|pm)( tomorrow)?\.$/);
    expect(fake.calls).toHaveLength(0);
  });

  it("never writes into a campaign that has started sending", async () => {
    h.campaign = { lockedAt: "2026-10-20T00:00:00Z" };
    const fake = useClaude([{ text: JSON.stringify(SHORTER_TEXT) }]);
    const res = await post({ ...REWRITE, campaignId: CAMPAIGN_ID });
    expect(res.status).toBe(409);
    expect(fake.calls).toHaveLength(0);
  });

  it("says what is missing before asking: words to suggest from, a subject to follow, words to rewrite", async () => {
    const fake = useClaude([{ text: subjectsAnswer(FIVE_SUBJECTS) }]);
    expect(await (await post({ ...SUBJECTS, subject: "", words: [] })).json()).toEqual({ error: "Write some of the email first, then Claude can suggest subject lines from it." });
    expect(await (await post({ ...PREVIEW_LINES, subject: "" })).json()).toEqual({ error: "Write the subject first, then Claude can suggest a preview line to follow it." });
    const button = { id: "b", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }] };
    expect((await post({ ...REWRITE, block: button })).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("reports a rewrite that dropped a link twice, after auditing both attempts", async () => {
    useClaude([{ text: JSON.stringify({ paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", it's back." }] }] }) }]);
    const res = await post(REWRITE);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/^Claude's rewrite didn't fit: drops the link on "Book a fitting"/);
    expect(h.audit.mock.calls[0][0]).toMatchObject({ after: { ended: "failed", attempts: 2, input_tokens: 6000 } });
  });
});
