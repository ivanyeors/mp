// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/lib/email-campaigns/rules";

/**
 * The email's checks through the page's actions (PRD-campaign-email-editor
 * slice 11): *Ready to send?* reuses a link's answer from the last ten
 * minutes, *Check again* and the wave's own start ask every link again, so a
 * link that died since the save holds the wave; and the site asks links
 * through the public-only request.
 */

const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const CAMPAIGN: Campaign = {
  name: "December",
  subject: "Sleep cooler",
  preheader: null,
  body: "",
  content: { v: 1, blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }], fallbacks: {} },
  greeting: true,
  button: null,
  audience: "subscribed",
  segmentId: null,
  id: ID,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
};

const h = vi.hoisted(() => ({ ready: true, plans: [] as Record<string, unknown>[], readiness: [] as Record<string, unknown>[], locked: [] as string[] }));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com", admin: {} }) }));
vi.mock("@/lib/email-campaigns/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/store")>()),
  getCampaign: vi.fn(async () => CAMPAIGN),
  lockCampaign: vi.fn(async (_admin: unknown, id: string) => void h.locked.push(id)),
}));
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/sender")>()),
  campaignReadiness: vi.fn(async (_setup: unknown, options: Record<string, unknown>) => {
    h.readiness.push(options);
    return { checks: [], advice: [], ready: true, allowance: null, sender: { from: null, replyTo: null } };
  }),
  planWave: vi.fn(async (_campaign: unknown, options: Record<string, unknown>) => {
    h.plans.push(options);
    return {
      readiness: { checks: [], advice: [], ready: h.ready, allowance: null, sender: { from: null, replyTo: null } },
      wave: "w1",
      plan: { considered: 1, eligible: 1, eligibleBuyers: 0, excluded: {}, alreadySent: 0, failed: 0 },
      customerIds: ["00000000-0000-4000-8000-000000000002"],
      requested: 1,
      limitedBy: null,
      waiting: 0,
    };
  }),
}));

const { checkCampaignReadiness, planCampaignWave } = await import("../actions");

beforeEach(() => {
  h.ready = true;
  h.plans.length = 0;
  h.readiness.length = 0;
  h.locked.length = 0;
});

describe("asking the links", () => {
  it("reuses the last ten minutes' answers in Ready to send?, and asks afresh on Check again", async () => {
    await checkCampaignReadiness(ID);
    await checkCampaignReadiness(ID, { fresh: true });
    expect(h.readiness.map((o) => o.freshLinks)).toEqual([false, true]);
    expect(h.readiness[0].campaign).toMatchObject({ id: ID, content: CAMPAIGN.content });
  });

  it("passes on the blocks the editor still marks Drafted with AI, as words only", async () => {
    await checkCampaignReadiness(ID, { aiDrafted: ["title", 7, null] as unknown as string[] });
    expect(h.readiness[0].aiDrafted).toEqual(["title"]);
  });

  it("asks every link again at the wave's start, so one that died since holds it", async () => {
    await planCampaignWave(ID, { size: 1 });
    expect(h.plans.map((o) => o.freshLinks)).toEqual([false]);

    h.ready = false;
    const held = await planCampaignWave(ID, { size: 1 }, true);
    expect(h.plans.map((o) => o.freshLinks)).toEqual([false, true]);
    expect(held).toMatchObject({ ok: true, started: false, customerIds: [] });
    expect(h.locked).toEqual([]);
  });

  it("goes through the public-only request on the site", async () => {
    const { campaignSenderSetup } = await vi.importActual<typeof import("@/lib/email-campaigns/setup")>("@/lib/email-campaigns/setup");
    const { publicLinkRequest } = await import("@/lib/email-campaigns/link-check");
    expect(campaignSenderSetup().linkRequest).toBe(publicLinkRequest);
  });
});
