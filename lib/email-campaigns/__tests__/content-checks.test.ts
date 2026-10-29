// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport } from "@/lib/email/types";
import { verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import { placeholdersCheck } from "../content-checks";
import type { CampaignContent } from "../content";
import { EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { planWave } from "../sender";
import { CHECK_LABEL } from "../send-flow";
import { INVITATION_STARTER, LAYOUT_STARTERS, starterContent } from "../starters";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

/**
 * No field still on its placeholder (PRD-campaign-email-editor slice 08):
 * a Starter's empty fields are placeholders, never sent, so the checks
 * before a wave ask for every word again, with Save's schema, and name each
 * block that is still empty. Slice 11 adds the email's other checks.
 */

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const BEA = "00000000-0000-4000-8000-000000000002";

/** A short note, written but for its heading. */
const NOTE: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
    { id: "head", type: "heading", level: 2, text: "" },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
    { id: "cta", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
  ],
  fallbacks: {},
};

describe("placeholdersCheck", () => {
  it("passes an email with every word written", () => {
    expect(placeholdersCheck(starterContent(INVITATION_STARTER))).toEqual({ key: "placeholders", ok: true, detail: "every block's words are written" });
  });

  it("names the block still empty, by its place and its kind", () => {
    expect(placeholdersCheck(NOTE)).toEqual({ key: "placeholders", ok: false, detail: "Block 2, Heading: still empty" });
  });

  it("names three of a Starter left as it landed, and counts the rest", () => {
    const check = placeholdersCheck(starterContent(LAYOUT_STARTERS[0]))!;
    expect(check.ok).toBe(false);
    expect(check.detail).toBe("Block 1, Hero: still empty; Block 2, Heading: still empty; Block 3, Text: still empty; and 2 more");
  });

  it("says what else Save would refuse in a block", () => {
    const linked: CampaignContent = {
      ...NOTE,
      blocks: [NOTE.blocks[0], { id: "cta", type: "buttons", buttons: [{ label: "Read it", target: "url", url: "http://mpillow.com", style: "primary" }] }],
    };
    expect(placeholdersCheck(linked)?.detail).toBe("Block 2, Buttons: The button's link must be a full https:// address.");
  });

  it("asks for a block in an email with none, and is no check at all for one written before blocks", () => {
    expect(placeholdersCheck({ v: 1, blocks: [], fallbacks: {} })).toEqual({ key: "placeholders", ok: false, detail: "the email has no blocks yet" });
    expect(placeholdersCheck(null)).toBeNull();
    expect(CHECK_LABEL.placeholders).toBe("Every block is written");
  });
});

describe("before a wave", () => {
  let world: FakeWorld;
  const campaign = (content: CampaignContent): Campaign => ({
    ...EMPTY_CAMPAIGN_DRAFT,
    name: "December",
    subject: "Sleep cooler",
    content,
    audience: "subscribed",
    id: CAMPAIGN,
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    lockedAt: null,
    archivedAt: null,
    createdBy: null,
  });
  const setup = () => {
    const transport: EmailTransport = { name: "resend", send: async () => ({ id: "re_1" }) };
    return {
      admin: fakeCampaignsClient(world) as unknown as SupabaseClient,
      transport,
      campaignFrom: "Mpillow <hello@hello.mpillow.com>",
      campaignDomain: "hello.mpillow.com",
      orderFrom: "orders@mpillow.com",
      replyTo: "Mpillow Support <support@mpillow.com>",
      origin: ORIGIN,
      unsubscribeSecret: SECRET,
      // The site answers one-click unsubscribe for links signed here.
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
        if (!verifyUnsubscribeToken(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)) {
          return Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
        }
        return Response.json({ ok: true });
      }) as unknown as typeof fetch,
      sleep: vi.fn(async () => undefined),
    };
  };

  beforeEach(() => {
    world = emptyWorld();
    world.customers.push({ id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed" });
    world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
  });

  it("holds the wave while a field is still on its placeholder, naming the block", async () => {
    const held = await planWave(campaign(NOTE), { size: 10 }, setup());
    expect(held.readiness.checks.find((c) => c.key === "placeholders")).toEqual({ key: "placeholders", ok: false, detail: "Block 2, Heading: still empty" });
    expect(held.readiness.ready).toBe(false);

    const written = await planWave(campaign({ ...NOTE, blocks: NOTE.blocks.filter((b) => b.id !== "head") }), { size: 10 }, setup());
    expect(written.readiness.checks.find((c) => c.key === "placeholders")?.ok).toBe(true);
    expect(written.readiness.ready).toBe(true);
  });
});
