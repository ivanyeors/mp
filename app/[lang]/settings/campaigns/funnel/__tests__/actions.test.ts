process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ permissions: new Set<string>(["campaigns"]), read: 0 }));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error("Forbidden");
    return { permissions: h.permissions, email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com" }) }));
vi.mock("@/lib/email/copy-admin", () => ({ readAllSavedCopy: vi.fn(async () => new Map()) }));
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/sender")>()),
  readCampaignRenderData: vi.fn(async () => ({ images: {}, products: {}, chineseProducts: null, problem: null, imageFailures: [] })),
}));

const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const ARCHIVED = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5b";
vi.mock("@/lib/email-campaigns/store", async () => {
  const { EMPTY_CAMPAIGN_DRAFT } = await import("@/lib/email-campaigns/rules");
  return {
    getCampaign: vi.fn(async (_admin: unknown, id: string) => {
      h.read += 1;
      if (id !== CAMPAIGN && id !== ARCHIVED) return null;
      return {
        ...EMPTY_CAMPAIGN_DRAFT,
        id,
        name: "We miss you",
        subject: "It has been a while",
        preheader: "",
        body: "It has been a while since your last visit.",
        archivedAt: id === ARCHIVED ? "2026-11-01T00:00:00Z" : null,
      };
    }),
  };
});

const { renderFunnelEmails } = await import("../actions");

beforeEach(() => {
  h.permissions = new Set(["campaigns"]);
  h.read = 0;
});

describe("renderFunnelEmails", () => {
  it("refuses without campaigns, before anything is read", async () => {
    h.permissions = new Set(["customers", "email-templates"]);
    await expect(renderFunnelEmails([`campaign:${CAMPAIGN}`])).rejects.toThrow("Forbidden");
    expect(h.read).toBe(0);
  });

  it("answers each card by its own key, with the real renders", async () => {
    const keys = [
      `campaign:${CAMPAIGN}`,
      "starter:playbook_we_miss_you",
      "starter:playbook_how_its_made",
      "template:results.draft_reminder_1w",
      "template:aftercare.review_request",
    ];
    const res = await renderFunnelEmails(keys);
    if (!res.ok) throw new Error(res.error);
    expect(Object.keys(res.renders).sort()).toEqual([...keys].sort());
    expect(res.renders[`campaign:${CAMPAIGN}`].subject).toBe("It has been a while");
    expect(res.renders[`campaign:${CAMPAIGN}`].html).toContain("It has been a while");
    expect(res.renders["template:results.draft_reminder_1w"].subject).not.toBe(res.renders["template:aftercare.review_request"].subject);
    expect(res.renders["template:aftercare.review_request"].templateId).toBeTruthy();
    for (const r of Object.values(res.renders)) expect(r.html).toMatch(/<html/i);
    expect(res.renders[`campaign:${CAMPAIGN}`].html).toContain("Mei Ling");
  });

  it("leaves out a key that does not parse, an archived campaign, and a template the programme does not send", async () => {
    const res = await renderFunnelEmails([
      `campaign:${ARCHIVED}`,
      "campaign:not-a-uuid",
      "starter:nope",
      "template:account.welcome_voucher",
      "anything",
      "template:aftercare.review_request",
    ]);
    if (!res.ok) throw new Error(res.error);
    expect(Object.keys(res.renders)).toEqual(["template:aftercare.review_request"]);
  });
});
