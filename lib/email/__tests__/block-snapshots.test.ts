// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EMAIL_BLOCK_SAMPLES } from "../__fixtures__/samples";
import { EMAIL_BLOCK_TYPES, emptyBlock, type CampaignContent } from "@/lib/email-campaigns/content";
import { EMPTY_CAMPAIGN_DRAFT, type CampaignDraft } from "@/lib/email-campaigns/rules";
import { renderCampaignPreview } from "@/lib/email-campaigns/sender";

/**
 * Each Email block as the editor's preview draws it, in light and with *Dark*
 * on (PRD-campaign-email-editor slice 15): one email per block type with every
 * option it has (EMAIL_BLOCK_SAMPLES), and one with every field on its
 * placeholder. A new block type adds its sample there, and its files appear
 * here. Dark is the same document with the shell's dark rules forced on: the
 * words, the subject and the plain text never differ.
 */

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

// The footer's year is the clock's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("each Email block in the preview, light and dark", () => {
  it.each(CASES)("%s", async (name, content) => {
    const light = renderCampaignPreview(draft(content), { origin: ORIGIN, firstName: "Wei Ling" });
    const dark = renderCampaignPreview(draft(content), { origin: ORIGIN, firstName: "Wei Ling", forceDark: true });
    await expect(light.html).toMatchFileSnapshot(`./__snapshots__/blocks/${name}.light.html`);
    await expect(dark.html).toMatchFileSnapshot(`./__snapshots__/blocks/${name}.dark.html`);
    await expect(`${light.subject}\n\n${light.text}`).toMatchFileSnapshot(`./__snapshots__/blocks/${name}.txt`);
    expect({ subject: dark.subject, text: dark.text }).toEqual({ subject: light.subject, text: light.text });
  });
});
