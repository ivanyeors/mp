process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  row: null as Record<string, unknown> | null,
  settings: [] as { key: string; value: string }[],
  tests: [] as unknown[][],
}));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
const recordAdminAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com" }) }));
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/sender")>()),
  sendCampaignTest: async (...args: unknown[]) => {
    h.tests.push(args);
    return { sent: ["me@mpillow.com"], failed: [] };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push({ table, ...row });
        return { select: () => ({ single: async () => ({ data: { id: "c-new" }, error: null }) }) };
      },
      update: (row: Record<string, unknown>) => {
        h.updates.push({ table, ...row });
        const done = { error: null, data: null };
        const q = { eq: () => q, is: () => q, then: (r: (v: typeof done) => unknown) => Promise.resolve(done).then(r) };
        return q;
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }),
        in: async () => ({ data: table === "site_settings" ? h.settings : [], error: null }),
      }),
    }),
  }),
}));

const { duplicateCampaign, previewCampaign, saveCampaign, sendCampaignTestAction } = await import("../actions");
const { CONTENT_PLACEHOLDERS } = await import("@/lib/email-campaigns/content");
const { campaignRowFromDraft, CampaignDraftSchema } = await import("@/lib/email-campaigns/rules");

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our " }, { text: "FibreCool", bold: true }, { text: " covers are back." }] }] },
    { id: "cta", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
  ],
  fallbacks: {},
};
const INPUT: CampaignDraftInput = {
  name: "December",
  subject: "{first_name}, sleep cooler",
  preheader: "",
  body: "",
  content: CONTENT,
  greeting: true,
  audience: "subscribed",
  segmentId: null,
  button: null,
};
const withBlocks = (blocks: unknown[]) => ({ ...INPUT, content: { ...CONTENT, blocks } }) as CampaignDraftInput;

const POINTS_LIVE = [
  { key: "points_enabled", value: "true" },
  { key: "points_launch_at", value: "2026-10-01T00:00:00.000Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.inserts = [];
  h.updates = [];
  h.row = null;
  h.settings = POINTS_LIVE;
  h.tests = [];
});

describe("Save", () => {
  it("stores the blocks, with no body and no button columns, and audits them by type", async () => {
    expect(await saveCampaign(null, INPUT)).toEqual({ ok: true, id: "c-new" });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({
      table: "email_campaigns",
      subject: "{first_name}, sleep cooler",
      body: null,
      content: CONTENT,
      button_label: null,
      button_target: null,
      button_url: null,
    });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "email_campaign.create", after: expect.objectContaining({ blocks: ["heading", "text", "buttons"], button: null }) }),
    );
  });

  it("refuses a crafted payload by field, writing nothing", async () => {
    const crafted = [
      withBlocks([{ id: "x", type: "html", html: "<script>alert(1)</script>" }]),
      withBlocks([{ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "<script>alert(1)</script>" }] }] }]),
      withBlocks([{ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Go", href: "javascript:alert(1)" }] }] }]),
      withBlocks([{ id: "b", type: "buttons", buttons: [{ label: "Go", target: "url", url: "javascript:alert(1)", style: "primary" }] }]),
      withBlocks([{ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ var: "password" }] }] }]),
    ];
    for (const input of crafted) {
      const res = await saveCampaign(null, input);
      expect(res, JSON.stringify(input.content)).toMatchObject({ ok: false, error: "Check the highlighted fields." });
      expect(Object.keys((res as { fieldErrors: Record<string, string> }).fieldErrors).some((k) => k.startsWith("content.blocks.0"))).toBe(true);
    }
    expect(h.inserts).toHaveLength(0);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("names a new block's empty field, which the preview shows on its placeholder", async () => {
    const input = withBlocks([{ id: "h", type: "heading", level: 2, text: "" }]);
    expect(await saveCampaign(null, input)).toMatchObject({ ok: false, fieldErrors: { "content.blocks.0.text": "Write the heading." } });
    const preview = await previewCampaign(input);
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.html).toContain(CONTENT_PLACEHOLDERS.heading);
    expect(h.inserts).toHaveLength(0);
  });
});

describe("the preview", () => {
  it("renders the blocks for the sample customer, the Variables filled, saving and auditing nothing", async () => {
    const res = await previewCampaign(INPUT);
    expect(res).toMatchObject({ ok: true, subject: "Mei Ling, sleep cooler" });
    if (!res.ok) return;
    expect(res.html).toMatch(/<h1 class="mp-fg"[^>]*>Sleep cooler this December<\/h1>/);
    expect(res.html).toContain(">Hi Mei Ling,</p>");
    expect(res.html).toContain("Our <strong>FibreCool</strong> covers are back.");
    expect(res.html).toContain("https://custom.mpillow.com/en-US/shop?utm_source=email_campaign");
    expect(h.inserts).toHaveLength(0);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("previews as a customer with no details: every fallback, in the subject, the greeting and the words (slice 13)", async () => {
    const input = withBlocks([{ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Dear " }, { var: "last_name" }] }] }]);
    const content = { ...input.content!, fallbacks: { last_name: "friend" } };
    const res = await previewCampaign({ ...input, content }, { previewAs: "no_details" });
    expect(res).toMatchObject({ ok: true, subject: "there, sleep cooler" });
    if (!res.ok) return;
    expect(res.html).toContain(">Hi there,</p>");
    expect(res.html).toContain(">Dear friend</p>");
    const sample = await previewCampaign({ ...input, content });
    expect(sample.ok && sample.html).toContain(">Dear Tan</p>");
  });
});

describe("Points balance (slice 13)", () => {
  const points = withBlocks([{ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "You have " }, { var: "points_balance" }, { text: " points." }] }] }]);
  const withFallback = { ...points, content: { ...points.content!, fallbacks: { points_balance: "some" } } } as CampaignDraftInput;

  it("asks for its fallback words, then saves while points are live", async () => {
    expect(await saveCampaign(null, points)).toMatchObject({
      ok: false,
      fieldErrors: { "content.fallbacks.points_balance": "Write what to say to a customer with no points balance." },
    });
    expect(await saveCampaign(null, withFallback)).toEqual({ ok: true, id: "c-new" });
  });

  it("can't be put in while points are not live, but a campaign that already says it keeps saving", async () => {
    h.settings = [{ key: "points_enabled", value: "false" }];
    expect(await saveCampaign(null, withFallback)).toEqual({
      ok: false,
      error: "Points aren't live yet, so Points balance can't go in the email. Take it out to save.",
    });
    expect(h.inserts).toHaveLength(0);
    const id = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
    h.row = { id, ...campaignRowFromDraft(CampaignDraftSchema.parse(withFallback)), created_at: "t", updated_at: "t", locked_at: null, archived_at: null };
    expect(await saveCampaign(id, { ...withFallback, name: "Renamed" })).toEqual({ ok: true, id });
    expect(h.updates).toEqual([expect.objectContaining({ table: "email_campaigns", name: "Renamed" })]);
    h.settings = [];
    expect(await saveCampaign(null, INPUT)).toEqual({ ok: true, id: "c-new" });
  });
});

describe("a test send", () => {
  it("fills a block campaign's Variables with the sample customer's, and greets a legacy one's sender", async () => {
    const id = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
    const row = { id, created_at: "t", updated_at: "t", locked_at: null, archived_at: null };
    h.row = { ...row, ...campaignRowFromDraft(CampaignDraftSchema.parse(INPUT)) };
    expect(await sendCampaignTestAction(id, ["me@mpillow.com"])).toMatchObject({ ok: true, sent: 1 });
    expect(h.tests[0][1]).toEqual({
      to: ["me@mpillow.com"],
      firstName: "Mei Ling",
      lastName: "Tan",
      pointsBalance: 1250,
      pillow: { tier: "premium", size: "M" },
    });
    const { FIRST_CAMPAIGN_DRAFT } = await import("@/lib/email-campaigns/rules");
    h.row = { ...row, ...campaignRowFromDraft(FIRST_CAMPAIGN_DRAFT) };
    await sendCampaignTestAction(id, ["me@mpillow.com"]);
    expect(h.tests[1][1]).toEqual({ to: ["me@mpillow.com"], firstName: "Ivan" });
  });
});

describe("Duplicate", () => {
  it("copies a block campaign's blocks as they are", async () => {
    const draft = CampaignDraftSchema.parse(INPUT);
    h.row = { id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a", ...campaignRowFromDraft(draft), created_at: "t", updated_at: "t", locked_at: "t", archived_at: null };
    expect(await duplicateCampaign("5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a")).toEqual({ ok: true, id: "c-new" });
    expect(h.inserts[0]).toMatchObject({ name: "Copy of December", body: null, content: CONTENT });
  });
});
