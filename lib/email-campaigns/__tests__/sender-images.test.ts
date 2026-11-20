process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import type { EmailRendition } from "@/lib/media-assets/email-renditions";
import type { CampaignContent } from "../content";
import { EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const RENDITION: EmailRendition = {
  assetId: PHOTO,
  url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${PHOTO}.jpg`,
  width: 1200,
  height: 800,
  bytes: 90_000,
  hasAlpha: false,
};

const h = vi.hoisted(() => ({ calls: 0, failed: new Map<string, string>() }));
vi.mock("@/lib/media-assets/email-renditions", () => ({
  ensureEmailRenditions: vi.fn(async () => {
    h.calls++;
    return { renditions: h.failed.size ? new Map() : new Map([[PHOTO, RENDITION]]), failed: h.failed };
  }),
}));

const { sendCampaignBatch, sendCampaignTest } = await import("../sender");

const ORIGIN = "https://custom.mpillow.com";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const BEA = "00000000-0000-4000-8000-000000000002";
const DAN = "00000000-0000-4000-8000-000000000004";

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "hero", type: "hero", image: { asset: PHOTO, alt: "A FibreCool cover" }, heading: "Sleep cooler", button: { label: "Shop the covers", target: "shop", style: "primary" } },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
  ],
  fallbacks: {},
};
const campaign: Campaign = {
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "December launch",
  subject: "Sleep cooler",
  content: CONTENT,
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: "2026-10-21T01:00:00Z",
  archivedAt: null,
  createdBy: null,
};

let world: FakeWorld;
let sent: OutgoingEmail[];

function setup() {
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
    unsubscribeSecret: "campaign-test-secret",
    sleep: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  h.calls = 0;
  h.failed = new Map();
  world = emptyWorld();
  world.customers.push(
    { id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed" },
    { id: DAN, email: "dan@x.test", first_name: "Dan", marketing_email: "subscribed" },
  );
  world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
});

describe("a campaign's images in what it sends", () => {
  it("shows the rendition in a test send", async () => {
    expect(await sendCampaignTest(campaign, { to: ["me@mpillow.com"], firstName: "Ivan" }, setup())).toEqual({ sent: ["me@mpillow.com"], failed: [] });
    expect(sent[0].html).toContain(`src="${RENDITION.url}" width="542" height="361"`);
    expect(h.calls).toBe(1);
  });

  it("reads the renditions once per batch, and every recipient's email shows them", async () => {
    const r = await sendCampaignBatch(campaign, { wave: "W1", customerIds: [BEA, DAN] }, setup());
    expect(r).toMatchObject({ sent: 2, failed: 0, stopped: null });
    expect(h.calls).toBe(1);
    for (const email of sent) expect(email.html).toContain(`src="${RENDITION.url}"`);
  });

  it("stops before anyone is sent an email with an image missing, and says why", async () => {
    h.failed = new Map([[PHOTO, "That image is no longer in the Media Library."]]);
    const r = await sendCampaignBatch(campaign, { wave: "W1", customerIds: [BEA, DAN] }, setup());
    expect(r).toMatchObject({ sent: 0, failed: 0, stopped: "an image in the email has no copy an inbox can show: That image is no longer in the Media Library." });
    expect(world.sends).toEqual([]);
    expect(await sendCampaignTest(campaign, { to: ["me@mpillow.com"], firstName: "Ivan" }, setup())).toEqual({
      refused: "an image in the email has no copy an inbox can show: That image is no longer in the Media Library.",
    });
    expect(sent).toEqual([]);
  });
});
