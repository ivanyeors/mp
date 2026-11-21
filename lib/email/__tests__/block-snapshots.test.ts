process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CHINESE_SAMPLE_CONTENT,
  CHINESE_SAMPLE_LINES,
  CHINESE_SAMPLE_PRODUCTS,
  EMAIL_BLOCK_SAMPLE_IMAGES,
  EMAIL_BLOCK_SAMPLE_PRODUCTS,
  EMAIL_BLOCK_SAMPLES,
} from "../__fixtures__/samples";
import { EMAIL_BLOCK_TYPES, emptyBlock, type CampaignContent } from "@/lib/email-campaigns/content";
import { EMPTY_CAMPAIGN_DRAFT, type CampaignDraft } from "@/lib/email-campaigns/rules";
import { renderCampaignPreview } from "@/lib/email-campaigns/sender";

const ORIGIN = "https://custom.mpillow.com";

const CASES: [name: string, content: CampaignContent][] = [
  ...EMAIL_BLOCK_TYPES.map((t): [string, CampaignContent] => [t, EMAIL_BLOCK_SAMPLES[t]]),
  ["placeholders", { v: 1, blocks: EMAIL_BLOCK_TYPES.map((t) => emptyBlock(t, t)), fallbacks: {} }],
];

const draft = (content: CampaignContent): CampaignDraft => ({
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "December cooling launch",
  subject: "{first_name}, sleep cooler this December",
  preheader: "Our FibreCool covers are back.",
  greeting: false,
  content,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("each Email block in the preview, light and dark", () => {
  it.each(CASES)("%s", async (name, content) => {
    const shown = { images: EMAIL_BLOCK_SAMPLE_IMAGES, products: EMAIL_BLOCK_SAMPLE_PRODUCTS };
    const light = renderCampaignPreview(draft(content), { origin: ORIGIN, firstName: "Wei Ling", ...shown });
    const dark = renderCampaignPreview(draft(content), { origin: ORIGIN, firstName: "Wei Ling", forceDark: true, ...shown });
    await expect(light.html).toMatchFileSnapshot(`./__snapshots__/blocks/${name}.light.html`);
    await expect(dark.html).toMatchFileSnapshot(`./__snapshots__/blocks/${name}.dark.html`);
    await expect(`${light.subject}\n\n${light.text}`).toMatchFileSnapshot(`./__snapshots__/blocks/${name}.txt`);
    expect({ subject: dark.subject, text: dark.text }).toEqual({ subject: light.subject, text: light.text });
  });

  it("the 中文 version", async () => {
    const zh: CampaignDraft = { ...draft(CHINESE_SAMPLE_CONTENT), subject: CHINESE_SAMPLE_LINES.subject, preheader: CHINESE_SAMPLE_LINES.preheader, greeting: true };
    const shown = { images: EMAIL_BLOCK_SAMPLE_IMAGES, products: CHINESE_SAMPLE_PRODUCTS, locale: "zh-CN" as const };
    const light = renderCampaignPreview(zh, { origin: ORIGIN, firstName: "美玲", ...shown });
    const dark = renderCampaignPreview(zh, { origin: ORIGIN, firstName: "美玲", forceDark: true, ...shown });
    await expect(light.html).toMatchFileSnapshot("./__snapshots__/blocks/chinese.light.html");
    await expect(dark.html).toMatchFileSnapshot("./__snapshots__/blocks/chinese.dark.html");
    await expect(`${light.subject}\n\n${light.text}`).toMatchFileSnapshot("./__snapshots__/blocks/chinese.txt");
    expect({ subject: dark.subject, text: dark.text }).toEqual({ subject: light.subject, text: light.text });
  });
});
