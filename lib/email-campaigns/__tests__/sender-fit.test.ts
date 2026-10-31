// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import type { CampaignContent } from "../content";
import { EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { planWave, renderCampaignPreview, sendCampaignBatch, usesYourPillow, type CampaignSenderSetup } from "../sender";
import { CHECK_LABEL, fitSummary } from "../send-flow";
import { NO_DETAILS, SAMPLE_RECIPIENT } from "../variables";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

/**
 * The fit checks and *Your pillow* in the sender (PRD-campaign-audiences
 * slice 09): a wave's plan runs the checks over the people it would go to,
 * reading their facts once, and lists them as advice that holds nothing; a
 * batch reads its recipients' pillows once, only for an email that says
 * *Your pillow*, and fills each one's.
 */

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const MBOLSTER = "7c0b0b0b-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANN = id(1);
const BEA = id(2);
const KAI = id(3);

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "h", type: "heading", level: 1, text: "How is {your_pillow}?" },
    { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Come for a free re-adjustment at the studio." }] }] },
  ],
  fallbacks: {},
};

const campaign = (content: CampaignContent = CONTENT, over: Partial<Campaign> = {}): Campaign => ({
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "Check-up",
  subject: "A check-up for {your_pillow}",
  preheader: null,
  content,
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: "2026-10-21T01:00:00Z",
  archivedAt: null,
  createdBy: null,
  ...over,
});

let world: FakeWorld;
let sent: OutgoingEmail[];

function setup(): CampaignSenderSetup {
  sent = [];
  const transport: EmailTransport = {
    name: "resend",
    async send(email) {
      sent.push(email);
      return { id: `re_${sent.length}` };
    },
  };
  return {
    admin: fakeCampaignsClient(world) as unknown as SupabaseClient,
    transport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: ORIGIN,
    unsubscribeSecret: SECRET,
    fetchImpl: vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
      if (!verifyUnsubscribeToken(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)) {
        return Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
      }
      return Response.json({ ok: true });
    }) as unknown as typeof fetch,
    sleep: vi.fn(async () => undefined),
    now: () => new Date("2026-10-31T04:00:00Z"),
  };
}

beforeEach(() => {
  world = emptyWorld();
  world.reads = [];
  world.customers.push(
    { id: ANN, email: "ann@x.test", first_name: "Ann", marketing_email: "subscribed", ship_country: "SG", bought: ["premium", "mbolster"] },
    { id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed", ship_country: "MY", locale: "zh-CN", last_purchase_at: "2026-10-29T00:00:00Z" },
    { id: KAI, email: "kai@x.test", first_name: "Kai", marketing_email: "subscribed", ship_country: null },
  );
  world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
  world.pillowLines = [
    { customer_id: ANN, product_type: "pillow", tier: "basic", size: "S", paid_at: "2025-01-01T00:00:00Z", order_item_id: "i1" },
    { customer_id: ANN, product_type: "pillow", tier: "premium", size: "m", paid_at: "2026-03-01T00:00:00Z", order_item_id: "i2" },
    { customer_id: BEA, product_type: "pillow", tier: "basic", size: "L", paid_at: "2026-10-29T00:00:00Z", order_item_id: "i3" },
  ];
});

describe("a wave's plan (slice 09)", () => {
  it("runs the fit checks over the people it would go to, as advice that holds nothing", async () => {
    const r = await planWave(campaign(), { size: 10 }, setup());
    expect(r.customerIds).toHaveLength(3);
    expect(r.readiness.ready).toBe(true);
    expect(r.fit.map((c) => [c.key, c.advisory, c.ok])).toEqual([
      ["fit_chinese", true, false],
      ["fit_fallbacks", true, false],
      ["fit_in_store", true, false],
      ["fit_recent", true, false],
    ]);
    expect(r.fit.find((c) => c.key === "fit_chinese")?.detail).toMatch(/^1 of 3 read Chinese and this email has no 中文 version/);
    expect(r.fit.find((c) => c.key === "fit_fallbacks")?.detail).toMatch(/^Your pillow: 1 of 3 have no pillow bought here and read “your pillow” instead/);
    expect(r.fit.find((c) => c.key === "fit_in_store")?.issues[0]).toMatchObject({
      blockId: "t",
      text: expect.stringMatching(/^1 of 3 ship outside Singapore, and 1 more ship to an unknown country, and Block 2, Text offers an in-store visit/),
    });
    // Each has a name in the checklist, and the plan a line for them.
    for (const c of r.fit) expect(CHECK_LABEL[c.key]).toBeTruthy();
    expect(fitSummary(r.fit.length)).toBe("Recommended: 4 things about who it goes to, listed under The email above. None holds the wave.");
    expect(fitSummary(1)).toMatch(/^Recommended: one thing about/);
    expect(fitSummary(0)).toBeNull();
    // Their facts, read once for the wave: the overview, then their pillow lines.
    expect(world.reads?.filter((t) => t === "admin_customer_overview" || t === "customer_purchase_lines")).toEqual([
      "admin_customer_overview",
      "customer_purchase_lines",
    ]);
  });

  it("counts a products block's class against what they bought, reading each product's class", async () => {
    world.products = [{ id: MBOLSTER, product_type: "bolster", product_variants: [] }];
    const shelf: CampaignContent = {
      ...CONTENT,
      blocks: [...CONTENT.blocks, { id: "shelf", type: "products", products: [MBOLSTER], layout: "rows", buttonLabel: "Shop" }],
    };
    const r = await planWave(campaign(shelf), { size: 10 }, setup());
    expect(r.fit.find((c) => c.key === "fit_already_own")?.issues).toEqual([
      expect.objectContaining({ blockId: "shelf", text: expect.stringMatching(/^1 of 3 already own an Mbolster, which Block 3, Products offers/) }),
    ]);
  });

  it("checks nobody when nobody can get it, and says so in one line when their facts can't be read", async () => {
    for (const c of world.customers) c.marketing_email = "unsubscribed";
    expect((await planWave(campaign(), { size: 10 }, setup())).fit).toEqual([]);
    for (const c of world.customers) c.marketing_email = "subscribed";

    const s = setup();
    const admin = s.admin as unknown as { from: (t: string) => unknown };
    const from = admin.from.bind(admin);
    admin.from = (t: string) => {
      if (t === "admin_customer_overview") throw new Error("Could not read who it goes to: timeout");
      return from(t);
    };
    const r = await planWave(campaign(), { size: 10 }, s);
    expect(r.readiness.ready).toBe(true);
    expect(r.fit).toEqual([expect.objectContaining({ key: "fit_unread", advisory: true, detail: expect.stringContaining("timeout") })]);
  });
});

describe("Your pillow in a wave (slice 09)", () => {
  it("fills each recipient's latest pillow as the shop names it, the fallback for one with none", async () => {
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA, KAI] }, setup());
    expect(r).toMatchObject({ sent: 3, failed: 0, stopped: null });
    expect(sent.map((e) => e.subject)).toEqual([
      "A check-up for Premium Mpillow, size M",
      "A check-up for Basic Mpillow, size L",
      "A check-up for your pillow",
    ]);
    expect(sent[0].html).toContain("How is Premium Mpillow, size M?");
    // One read for the batch.
    expect(world.reads?.filter((t) => t === "customer_purchase_lines")).toEqual(["customer_purchase_lines"]);
  });

  it("reads no pillow for an email that does not say it", async () => {
    const plain: CampaignContent = { ...CONTENT, blocks: [CONTENT.blocks[1]] };
    await sendCampaignBatch(campaign(plain, { subject: "A check-up" }), { wave: "w1", customerIds: [ANN] }, setup());
    expect(sent).toHaveLength(1);
    expect(world.reads).not.toContain("customer_purchase_lines");
    expect(usesYourPillow(campaign(plain, { subject: "A check-up" }))).toBe(false);
    expect(usesYourPillow(campaign())).toBe(true);
  });

  it("stops the batch, sending nobody, when their pillows can't be read", async () => {
    const s = setup();
    const admin = s.admin as unknown as { from: (t: string) => unknown };
    const from = admin.from.bind(admin);
    admin.from = (t: string) => {
      if (t === "customer_purchase_lines") throw new Error("Could not read their pillows: timeout");
      return from(t);
    };
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN] }, s);
    expect(r).toMatchObject({ sent: 0, stopped: "Could not read their pillows: timeout" });
    expect(sent).toEqual([]);
  });

  it("previews as the sample customer's pillow, or the fallback with no details", () => {
    expect(renderCampaignPreview(campaign(), { origin: ORIGIN, ...SAMPLE_RECIPIENT }).subject).toBe("A check-up for Premium Mpillow, size M");
    expect(renderCampaignPreview(campaign(), { origin: ORIGIN, ...NO_DETAILS }).subject).toBe("A check-up for your pillow");
  });
});
