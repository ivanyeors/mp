// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";
import { emptyWorld, fakeCampaignsClient } from "@/lib/email-campaigns/__tests__/fake-db";

/**
 * The editor's preview is the email the test send delivers
 * (PRD-campaign-email-editor slice 04): the same renderer and the same HTML,
 * but for the unsubscribe link, which in the preview unsubscribes nobody. And
 * the preview's Dark toggle reaches the renderer through the action.
 */

const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email-campaigns/sender")>();
  return {
    ...actual,
    renderCampaignPreview: (...args: Parameters<typeof actual.renderCampaignPreview>) => {
      h.calls.push(args);
      return actual.renderCampaignPreview(...args);
    },
  };
});
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email-campaigns/setup", () => ({
  campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com", campaignFrom: " Mpillow <hello@hello.mpillow.com> " }),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { previewCampaign } = await import("../actions");
const { readCampaignRenderData, renderCampaignPreview, sendCampaignTest } = await import("@/lib/email-campaigns/sender");
const { CampaignPreviewSchema } = await import("@/lib/email-campaigns/rules");
const { FORCED_DARK_STYLE_ID } = await import("@/lib/email/base");

const ORIGIN = "https://custom.mpillow.com";
const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Hello " }, { var: "first_name" }, { text: ", our " }, { text: "FibreCool", bold: true }, { text: " covers are back." }] }] },
    { id: "list", type: "text", paragraphs: [{ kind: "bullets", items: [[{ text: "Every size" }], [{ text: "the care guide", href: "https://custom.mpillow.com/en-US/faq" }]] }] },
    { id: "line", type: "divider" },
    { id: "gap", type: "spacer", size: "m" },
    {
      id: "cta",
      type: "buttons",
      buttons: [
        { label: "Shop the covers", target: "shop", style: "primary" },
        { label: "Book a fitting", target: "book_fitting", style: "secondary" },
      ],
    },
  ],
  fallbacks: { first_name: "friend" },
};
const INPUT: CampaignDraftInput = {
  name: "December cooling",
  subject: "{first_name}, sleep cooler",
  preheader: "New covers for {first_name}",
  body: "",
  content: CONTENT,
  greeting: true,
  audience: "subscribed",
  segmentId: null,
  button: null,
};

beforeEach(() => {
  h.calls = [];
});

/** The test send of `draft`, through the same transport and headers as a wave. */
async function testSend(draft: ReturnType<typeof CampaignPreviewSchema.parse>, admin: SupabaseClient = fakeCampaignsClient(emptyWorld()) as unknown as SupabaseClient) {
  const sent: OutgoingEmail[] = [];
  const transport: EmailTransport = {
    name: "resend",
    async send(email) {
      sent.push(email);
      return { id: "re_1" };
    },
  };
  const r = await sendCampaignTest(draft, { to: ["me@mpillow.com"], firstName: "Ivan" }, {
    admin,
    transport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: ORIGIN,
    unsubscribeSecret: "campaign-test-secret",
    sleep: async () => undefined,
  });
  expect(r).toEqual({ sent: ["me@mpillow.com"], failed: [] });
  return sent;
}

// The test's own unsubscribe link (signed for nobody) against the preview's, which has none.
const unsigned = (s: string) => s.replace(/\/en-US\/unsubscribe\?[^"\s]*/g, "/en-US/unsubscribe");

describe("the preview and the test send", () => {
  it("are the same HTML and words, but for the unsubscribe link", async () => {
    const draft = CampaignPreviewSchema.parse(INPUT);
    const preview = renderCampaignPreview(draft, { origin: ORIGIN, firstName: "Ivan" });
    const sent = await testSend(draft);

    expect(sent[0].subject).toBe(`[Test] ${preview.subject}`);
    expect(unsigned(sent[0].html)).toBe(preview.html);
    expect(unsigned(sent[0].text)).toBe(preview.text);
    expect(preview.html).toContain("Hello Ivan, our <strong>FibreCool</strong> covers are back.");
    expect(preview.html).not.toContain("dashed"); // every word written: no placeholder drawn
  });

  it("show the same products, each as the shop sells it at that moment (slice 07)", async () => {
    const world = emptyWorld();
    const id = "9e4b6d8a-2f1c-4e3a-8b7d-1c2e3f4a5b6d";
    world.products = [
      {
        id,
        slug: "camel-bolster-case",
        product_type: "accessory",
        status: "active",
        content: { "en-US": { title: "Camel Bolster Case", description: "", body: "" } },
        product_variants: [{ id: "v1", price: 29.5, compare_at_price: 35, currency: "SGD", is_active: true, position: 0 }],
        product_images: [],
      },
    ];
    const admin = fakeCampaignsClient(world) as unknown as SupabaseClient;
    const draft = CampaignPreviewSchema.parse({
      ...INPUT,
      content: { ...CONTENT, blocks: [...CONTENT.blocks, { id: "shop", type: "products", products: [id], layout: "rows", buttonLabel: "Shop now" }] },
    });
    const preview = renderCampaignPreview(draft, { origin: ORIGIN, firstName: "Ivan", ...(await readCampaignRenderData(admin, draft.content)) });
    const sent = await testSend(draft, admin);
    expect(unsigned(sent[0].html)).toBe(preview.html);
    expect(unsigned(sent[0].text)).toBe(preview.text);
    expect(preview.text).toMatch(/Camel Bolster Case\nSGD.29\.50 \(was SGD.35\.00\)/);
  });
});

describe("previewCampaign", () => {
  it("hands the Dark toggle to the renderer, and names the sending setup's From", async () => {
    const light = await previewCampaign(INPUT);
    // A block campaign previews as the sample customer (slice 13), as its test send reads.
    expect(h.calls.at(-1)?.[1]).toMatchObject({ forceDark: false, firstName: "Mei Ling", lastName: "Tan", pointsBalance: 1250 });
    expect(light).toMatchObject({ ok: true, subject: "Mei Ling, sleep cooler", from: "Mpillow <hello@hello.mpillow.com>" });
    const dark = await previewCampaign(INPUT, { forceDark: true });
    expect(h.calls.at(-1)?.[1]).toMatchObject({ forceDark: true });
    // Dark is the shell's own dark rules applied (slice 15); Light is the email as sent.
    expect(light.ok && light.html).not.toContain(`id="${FORCED_DARK_STYLE_ID}"`);
    expect(dark.ok && dark.html).toContain(`id="${FORCED_DARK_STYLE_ID}"`);
  });
});
