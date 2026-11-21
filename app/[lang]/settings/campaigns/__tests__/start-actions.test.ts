process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  row: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  tables: [] as string[],
  selects: [] as string[],
  filters: [] as string[],
}));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com" }) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      h.tables.push(table);
      return {
        insert: (row: Record<string, unknown>) => {
          h.inserts.push({ table, ...row });
          return { select: () => ({ single: async () => ({ data: { id: "c-new" }, error: null }) }) };
        },
        select: (columns: string) => {
          h.selects.push(columns);
          const q = {
            eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }),
            is: (column: string) => {
              h.filters.push(`is ${column}`);
              return q;
            },
            order: (column: string, o: { ascending: boolean }) => {
              h.filters.push(`order ${column} ${o.ascending ? "asc" : "desc"}`);
              return q;
            },
            limit: async (n: number) => {
              h.filters.push(`limit ${n}`);
              return { data: h.rows, error: null };
            },
          };
          return q;
        },
      };
    },
  }),
}));

const { duplicateCampaign, listPastCampaignsAction, previewStarters } = await import("../actions");
const { campaignRowFromDraft, CampaignDraftSchema } = await import("@/lib/email-campaigns/rules");
const { CONTENT_PLACEHOLDERS } = await import("@/lib/email-campaigns/content");
const { BLANK_PREVIEW, INVITATION_STARTER, LAYOUT_STARTERS, STARTERS, starterDraft } = await import("@/lib/email-campaigns/starters");

const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const SEGMENT = "5e000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.row = null;
  h.inserts = [];
  h.tables = [];
  h.selects = [];
  h.filters = [];
});

describe("A past campaign", () => {
  it("lists every campaign, archived ones too, newest first, by name and subject only", async () => {
    h.rows = [
      { id: "c3", name: "December launch", subject: "Sleep cooler", created_at: "2026-10-28T00:00:00Z", locked_at: null, archived_at: null },
      { id: "c2", name: "Invitation", subject: "Our new website", created_at: "2026-10-21T00:00:00Z", locked_at: "2026-10-22T00:00:00Z", archived_at: null },
      { id: "c1", name: "Old news", subject: "Hello", created_at: "2026-09-01T00:00:00Z", locked_at: "2026-09-02T00:00:00Z", archived_at: "2026-10-01T00:00:00Z" },
    ];
    expect(await listPastCampaignsAction()).toEqual({
      ok: true,
      campaigns: [
        { id: "c3", name: "December launch", subject: "Sleep cooler", createdAt: "2026-10-28T00:00:00Z", started: false, archived: false },
        { id: "c2", name: "Invitation", subject: "Our new website", createdAt: "2026-10-21T00:00:00Z", started: true, archived: false },
        { id: "c1", name: "Old news", subject: "Hello", createdAt: "2026-09-01T00:00:00Z", started: true, archived: true },
      ],
    });
    expect(h.tables).toEqual(["email_campaigns"]);
    expect(h.selects).toEqual(["id, name, subject, created_at, locked_at, archived_at"]);
    expect(h.filters).toEqual(["order created_at desc", "limit 50"]);
  });

  it("copies only the email, who it goes to and its name: never its sends, its waves or its lock", async () => {
    const draft = CampaignDraftSchema.parse({
      ...starterDraft(INVITATION_STARTER),
      audience: "segment",
      segmentId: SEGMENT,
    });
    h.row = { id: ID, ...campaignRowFromDraft(draft), created_at: "t", updated_at: "t", locked_at: "2026-10-22T00:00:00Z", archived_at: "2026-10-25T00:00:00Z" };

    expect(await duplicateCampaign(ID)).toEqual({ ok: true, id: "c-new" });
    expect(h.inserts).toEqual([{ table: "email_campaigns", ...campaignRowFromDraft({ ...draft, name: `Copy of ${draft.name}` }), created_by_profile_id: "s1" }]);
    expect(h.inserts[0]).not.toHaveProperty("locked_at");
    expect(h.inserts[0]).not.toHaveProperty("archived_at");
    expect(h.inserts[0]).not.toHaveProperty("id");
    expect(new Set(h.tables)).toEqual(new Set(["email_campaigns"]));
  });
});

describe("the thumbnails", () => {
  it("are each Starter, and a blank email, as the real renderer draws them on their placeholders", async () => {
    const res = await previewStarters();
    if (!res.ok) throw new Error(res.error);
    expect(Object.keys(res.previews)).toEqual([BLANK_PREVIEW, ...STARTERS.map((s) => s.id)]);
    for (const html of Object.values(res.previews)) expect(html).toMatch(/^<!doctype html>/i);
    expect(res.previews[BLANK_PREVIEW]).toContain(CONTENT_PLACEHOLDERS.empty);
    const launch = res.previews[LAYOUT_STARTERS[0].id];
    for (const hint of [CONTENT_PLACEHOLDERS.image, CONTENT_PLACEHOLDERS.heading, CONTENT_PLACEHOLDERS.text, CONTENT_PLACEHOLDERS.products]) expect(launch).toContain(hint);
    expect(res.previews[INVITATION_STARTER.id]).toContain("Sign in and collect your points");
    expect(launch).toContain("Hi Mei Ling,");
    expect(h.tables).toEqual([]);
  });
});
