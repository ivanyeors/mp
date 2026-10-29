// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_LINES, SAMPLE_COVER_PRODUCT, SAMPLE_PHOTO_ASSET } from "@/lib/email/__fixtures__/samples";
import { money } from "@/lib/email/format";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import type { EmailRendition } from "@/lib/media-assets/email-renditions";
import { verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import { keepChineseBlock, withoutChineseVersion } from "../chinese-version";
import type { CampaignContent, EmailBlock } from "../content";
import { campaignLedgerKey, EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

/**
 * Sending the 中文 version (PRD-campaign-email-editor slice 17, decision 11):
 * in one wave, a Customer whose `locale` is `zh-CN` gets the 中文 email and
 * everyone else the English one, one ledger row each; a campaign without a
 * 中文 version sends English to everyone, as before. A block not translated,
 * or out of date and not kept, holds the wave by name. A test goes in the
 * language Staff choose.
 */

vi.mock("@/lib/media-assets/email-renditions", () => ({
  ensureEmailRenditions: vi.fn(async (_admin: unknown, ids: string[]) => {
    const renditions = new Map<string, EmailRendition>();
    for (const id of ids) renditions.set(id, { assetId: id, url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${id}.jpg`, width: 1200, height: 800, bytes: 80_000, hasAlpha: false });
    return { renditions, failed: new Map() };
  }),
}));

const { chineseTestBlocker, planWave, sendCampaignBatch, sendCampaignTest } = await import("../sender");
const { CHECK_LABEL, languageSummary } = await import("../send-flow");

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const BEA = "00000000-0000-4000-8000-000000000002";
const MEI = "00000000-0000-4000-8000-000000000003";
const DAN = "00000000-0000-4000-8000-000000000004";

const campaign = (content: CampaignContent = CHINESE_SAMPLE_CONTENT): Campaign => ({
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "December cooling launch",
  subject: CHINESE_SAMPLE_LINES.subject,
  preheader: CHINESE_SAMPLE_LINES.preheader,
  content,
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: "2026-10-21T01:00:00Z",
  archivedAt: null,
  createdBy: null,
});

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
  };
}

beforeEach(() => {
  world = emptyWorld();
  world.customers.push(
    { id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed" },
    { id: MEI, email: "mei@x.test", first_name: "美玲", marketing_email: "subscribed", locale: "zh-CN" },
    { id: DAN, email: "dan@x.test", first_name: null, marketing_email: "subscribed", locale: "zh-CN" },
  );
  world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
  // The cover, named in both languages as the shop names it.
  world.products = [
    {
      id: SAMPLE_COVER_PRODUCT,
      slug: "fibrecool-cover",
      product_type: "accessory",
      status: "active",
      content: { "en-US": { title: "FibreCool Cover", description: "", body: "" }, "zh-CN": { title: "FibreCool 凉感枕套", description: "", body: "" } },
      product_variants: [{ id: "cover", sku: "cover", title: "cover", price: 39, compare_at_price: null, currency: "SGD", is_active: true, position: 0 }],
      product_images: [{ id: "i1", url: "https://x.test/cover.webp", alt_text: null, position: 0, media_asset_id: SAMPLE_PHOTO_ASSET }],
    },
  ];
});

const to = (address: string) => sent.find((e) => e.to === address)!;

describe("one wave, two languages", () => {
  it("sends a zh-CN Customer the 中文 email and everyone else the English one, one ledger row each", async () => {
    const s = setup();
    const plan = await planWave(campaign(), { size: 10 }, s);
    expect(plan.readiness.checks.find((c) => c.key === "chinese")).toEqual({ key: "chinese", ok: true, detail: "every block, the subject and the preview line are in Chinese" });
    expect(plan.readiness.ready).toBe(true);
    expect(plan.plan).toMatchObject({ eligible: 3, eligibleChinese: 2, selectedChinese: 2 });

    const r = await sendCampaignBatch(campaign(), { wave: "W1", customerIds: [BEA, MEI, DAN] }, s);
    expect(r).toMatchObject({ sent: 3, failed: 0, stopped: null });
    expect(world.sends.map((x) => [x.customer_id, x.template, x.status])).toEqual([
      [BEA, campaignLedgerKey(CAMPAIGN), "sent"],
      [MEI, campaignLedgerKey(CAMPAIGN), "sent"],
      [DAN, campaignLedgerKey(CAMPAIGN), "sent"],
    ]);

    const bea = to("bea@x.test");
    expect(bea.subject).toBe("Bea, sleep cooler this December");
    expect(bea.html).toContain('<html lang="en"');
    expect(bea.text).toContain("Sleep cooler this December");
    expect(bea.text).toContain(`FibreCool Cover\n${money(39, "SGD")}`);
    expect(bea.text).not.toMatch(/[一-鿿]/);

    const mei = to("mei@x.test");
    expect(mei.subject).toBe("美玲，这个十二月睡得更清凉");
    expect(mei.html).toContain('<html lang="zh-CN"');
    expect(mei.html).toContain("FibreCool 枕套回来了，各种尺寸都有。");
    expect(mei.text).toContain("美玲，您好！");
    expect(mei.text).toContain(`FibreCool 凉感枕套\n${money(39, "SGD")}`);
    expect(mei.text).toContain("/zh-CN/shop/fibrecool-cover?utm_source=email_campaign");
    expect(mei.text).toContain("您收到这封邮件，是因为您同意接收 Mpillow 的电子邮件。");
    expect(mei.text).toMatch(/取消订阅：https:\/\/custom\.mpillow\.com\/zh-CN\/unsubscribe\?/);
    expect(mei.html).toContain("取消订阅</a>");
    // Unsubscribe and List-Unsubscribe are the reader's own, in either language.
    expect(mei.headers?.["List-Unsubscribe"]).toContain(MEI);

    // No first name: the 中文 fallback, and a polite hello alone.
    const dan = to("dan@x.test");
    expect(dan.subject).toBe("您，这个十二月睡得更清凉");
    expect(dan.text).toContain("您好！");
    expect(dan.text).not.toContain("您，您好");
  });

  it("sends English to everyone, as before, for a campaign without a 中文 version", async () => {
    const english = campaign(withoutChineseVersion(CHINESE_SAMPLE_CONTENT));
    const s = setup();
    const plan = await planWave(english, { size: 10 }, s);
    expect(plan.readiness.checks.map((c) => c.key)).not.toContain("chinese");
    expect(languageSummary({ eligible: 3, eligibleChinese: 2, selected: 3, selectedChinese: 2, hasChinese: false })).toBe(
      "2 of 3 customers read the site in Chinese; they get English, as this email has no 中文 version.",
    );
    await sendCampaignBatch(english, { wave: "W1", customerIds: [BEA, MEI, DAN] }, s);
    expect(sent).toHaveLength(3);
    for (const email of sent) {
      expect(email.html).toContain('<html lang="en"');
      // English words throughout: a Chinese name is the reader's own.
      expect(email.text.replaceAll("美玲", "")).not.toMatch(/[一-鿿]/);
    }
    expect(to("mei@x.test").subject).toBe("美玲, sleep cooler this December");
    expect(to("dan@x.test").subject).toBe("there, sleep cooler this December");
  });
});

describe("a 中文 version not finished holds the wave, by block", () => {
  const edited = (id: string, edit: (b: EmailBlock) => EmailBlock): CampaignContent => ({ ...CHINESE_SAMPLE_CONTENT, blocks: CHINESE_SAMPLE_CONTENT.blocks.map((b) => (b.id === id ? edit(b) : b)) });

  it("names a block whose English changed, until it is kept", async () => {
    const changed = edited("why", (b) => ({ ...b, text: "Why FibreCool keeps you cool" }) as EmailBlock);
    const r = await planWave(campaign(changed), { size: 10 }, setup());
    expect(r.readiness.checks.find((c) => c.key === "chinese")).toMatchObject({
      ok: false,
      detail: expect.stringContaining("Block 3, Heading: english changed since this was translated"),
    });
    expect(r.readiness.ready).toBe(false);
    expect(CHECK_LABEL.chinese).toBe("The 中文 version is complete");

    const kept = await planWave(campaign(keepChineseBlock(changed, "why")), { size: 10 }, setup());
    expect(kept.readiness.ready).toBe(true);
  });

  it("names a block added in English and not translated yet, and the subject when it changed", async () => {
    const added: CampaignContent = { ...CHINESE_SAMPLE_CONTENT, blocks: [...CHINESE_SAMPLE_CONTENT.blocks, { id: "more", type: "heading", level: 2, text: "Care" }] };
    const r = await planWave({ ...campaign(added), subject: "Sleep cooler tonight" }, { size: 10 }, setup());
    const detail = r.readiness.checks.find((c) => c.key === "chinese")?.detail ?? "";
    expect(detail).toContain("the subject or preview line changed in English since it was translated");
    expect(detail).toContain("Block 9, Heading: not translated yet");
  });
});

describe("a test, in the language Staff choose", () => {
  it("sends the 中文 version when asked, and English by default", async () => {
    const s = setup();
    expect(await sendCampaignTest(campaign(), { to: ["me@mpillow.com"], firstName: "Mei Ling", locale: "zh-CN" }, s)).toEqual({ sent: ["me@mpillow.com"], failed: [] });
    expect(sent[0].subject).toBe("[Test] Mei Ling，这个十二月睡得更清凉");
    expect(sent[0].html).toContain('<html lang="zh-CN"');
    await sendCampaignTest(campaign(), { to: ["me@mpillow.com"], firstName: "Mei Ling" }, s);
    expect(sent.at(-1)!.subject).toBe("[Test] Mei Ling, sleep cooler this December");
  });

  it("refuses a 中文 test with no 中文 version, or with a block that has no 中文 words yet", async () => {
    const english = campaign(withoutChineseVersion(CHINESE_SAMPLE_CONTENT));
    expect(await sendCampaignTest(english, { to: ["me@mpillow.com"], firstName: "Mei Ling", locale: "zh-CN" }, setup())).toEqual({
      refused: "This campaign has no 中文 version: translate it first.",
    });
    const added = campaign({ ...CHINESE_SAMPLE_CONTENT, blocks: [...CHINESE_SAMPLE_CONTENT.blocks, { id: "more", type: "heading", level: 2, text: "Care" }] });
    expect(chineseTestBlocker(added)).toBe("The 中文 version isn't finished: Block 9, Heading: not translated yet.");
    // Words out of date still go: a test is how Staff read them.
    expect(chineseTestBlocker({ ...campaign(), subject: "Sleep cooler tonight" })).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe("the Send card says who gets which language", () => {
  it("counts the audience and the wave", () => {
    expect(languageSummary({ eligible: 1830, eligibleChinese: 214, selected: 1830, selectedChinese: 214, hasChinese: true })).toBe(
      "214 of 1,830 customers read the site in Chinese and will get the 中文 version; everyone else gets English.",
    );
    expect(languageSummary({ eligible: 1830, eligibleChinese: 214, selected: 100, selectedChinese: 12, hasChinese: true })).toBe(
      "214 of 1,830 customers read the site in Chinese and will get the 中文 version; everyone else gets English. In this wave, 12 of 100 get it.",
    );
    expect(languageSummary({ eligible: 10, eligibleChinese: 0, selected: 10, selectedChinese: 0, hasChinese: true })).toBeNull();
  });
});
