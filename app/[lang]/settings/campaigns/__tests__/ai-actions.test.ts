import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * *Keep* on a draft (PRD-campaign-email-editor slice 09): `campaigns` first,
 * like every campaign action, and its one write is the audit entry that the
 * draft was kept, citing the draft's call. It never touches the campaign.
 */

const h = vi.hoisted(() => ({ permissions: new Set<string>(["campaigns"]), audit: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error("Forbidden");
    return { permissions: h.permissions, email: "owner@example.com", memberId: "m1", userId: "u1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    throw new Error("the database was touched");
  },
}));

const { keepAiDraft } = await import("../ai-actions");

const DRAFT = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = new Set(["campaigns"]);
});

describe("keepAiDraft", () => {
  it("refuses Staff without campaigns, before anything is written", async () => {
    h.permissions = new Set(["customers"]);
    await expect(keepAiDraft(DRAFT, CAMPAIGN)).rejects.toThrow("Forbidden");
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("records that the draft was kept, by its call's id, and nothing else", async () => {
    expect(await keepAiDraft(DRAFT, CAMPAIGN)).toEqual({ ok: true });
    expect(h.audit).toHaveBeenCalledWith({
      actor: expect.objectContaining({ memberId: "m1" }),
      action: "email_campaign.ai_draft_kept",
      entityType: "email_campaign",
      entityId: CAMPAIGN,
      after: { draft_id: DRAFT, kept: true },
    });
  });

  it("refuses an id that is not a draft's", async () => {
    expect(await keepAiDraft("nope", null)).toEqual({ ok: false, error: "That draft does not exist." });
    expect(h.audit).not.toHaveBeenCalled();
  });
});
