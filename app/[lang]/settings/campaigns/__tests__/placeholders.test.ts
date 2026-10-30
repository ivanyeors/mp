// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * A placeholder is never a value (PRD-campaign-email-editor slice 01): the
 * editor sends an empty field to Save as an empty string, which Save refuses
 * with today's field errors, and stores only what was typed. The preview
 * draws the placeholders, and saves and audits nothing.
 */

const h = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
const recordAdminAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com" }) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push({ table, ...row });
        return { select: () => ({ single: async () => ({ data: { id: "c-new" }, error: null }) }) };
      },
    }),
  }),
}));

const { previewCampaign, saveCampaign } = await import("../actions");
const { CAMPAIGN_PLACEHOLDERS } = await import("@/lib/email-campaigns/rules");

/** The editor's input for a new campaign with nothing typed, as it sends it. */
const EMPTY: CampaignDraftInput = {
  name: "",
  subject: "",
  preheader: "",
  body: "",
  greeting: true,
  audience: "imported_not_signed_in",
  segmentId: null,
  button: null,
};
const HINTS = Object.values(CAMPAIGN_PLACEHOLDERS);

beforeEach(() => {
  vi.clearAllMocks();
  h.inserts = [];
});

describe("Save", () => {
  it("refuses an email still on its placeholders, with today's field errors, writing nothing", async () => {
    const res = await saveCampaign(null, EMPTY);
    expect(res).toEqual({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { name: "Give the campaign a name.", subject: "Write a subject.", body: "Write the email." },
    });
    expect(h.inserts).toHaveLength(0);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("stores only what was typed: the empty preview line as none, no button, and no placeholder in the row or the audit", async () => {
    const res = await saveCampaign(null, { ...EMPTY, name: "December", subject: "Sleep cooler", body: "Our covers are back." });
    expect(res).toEqual({ ok: true, id: "c-new" });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({
      table: "email_campaigns",
      name: "December",
      subject: "Sleep cooler",
      preheader: null,
      body: "Our covers are back.",
      button_label: null,
      button_target: null,
    });
    const written = JSON.stringify([h.inserts, recordAdminAction.mock.calls]);
    for (const hint of HINTS) expect(written).not.toContain(hint);
  });
});

describe("the preview", () => {
  it("shows an empty email's layout with its placeholders, and saves and audits nothing", async () => {
    const res = await previewCampaign({ ...EMPTY, button: { target: "sign_in", label: "", url: null } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const hint of [CAMPAIGN_PLACEHOLDERS.subject, CAMPAIGN_PLACEHOLDERS.body, CAMPAIGN_PLACEHOLDERS.buttonLabel]) {
      expect(res.html).toContain(hint);
    }
    expect(res.html).toContain("Hi Ivan,");
    expect(res.subject).toBe("");
    expect(h.inserts).toHaveLength(0);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("still refuses what Save would refuse besides an empty field", async () => {
    const res = await previewCampaign({ ...EMPTY, button: { target: "url", label: "Shop", url: "http://x.test" } });
    expect(res).toMatchObject({ ok: false, fieldErrors: { "button.url": "The button's link must be a full https:// address." } });
  });
});
