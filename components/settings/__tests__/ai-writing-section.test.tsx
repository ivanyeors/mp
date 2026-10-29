import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiWritingForm } from "../ai-writing-section";
import { AI_WRITING_DEFAULTS, type AiWritingSettings } from "@/lib/ai/writing-settings";
import type { AiUsageLine, AiUsageThisMonth } from "@/lib/ai/usage";

/** General → AI writing (PRD-campaign-email-editor slice 16): the owner's demo, on a phone as on a desktop. */

const line = (calls: number, inputTokens: number, outputTokens: number, costUsd: number): AiUsageLine => ({
  calls,
  inputTokens,
  outputTokens,
  costUsd,
});

const empty = line(0, 0, 0, 0);

/** 38 drafts and 51 quick actions this month, priced at US$4 / US$20 a million tokens. */
const usage: AiUsageThisMonth = {
  since: "2026-09-30T16:00:00.000Z",
  byKind: {
    draft: line(38, 114_000, 107_010, 2.5962),
    translate: empty,
    subjects: line(20, 38_000, 12_000, 0.392),
    preview_lines: line(16, 27_200, 4_800, 0.2048),
    rewrite: line(15, 18_000, 6_750, 0.207),
  },
  total: line(89, 197_200, 130_560, 3.4),
  unlistedModelCalls: 0,
};

const render = (opts: { value?: AiWritingSettings; configured?: boolean; usage?: AiUsageThisMonth | null } = {}) =>
  renderToStaticMarkup(
    <AiWritingForm
      value={opts.value ?? AI_WRITING_DEFAULTS}
      onChange={() => {}}
      configured={opts.configured ?? true}
      usage={opts.usage === undefined ? usage : opts.usage}
      saving={false}
      onSave={() => {}}
    />,
  );

describe("AiWritingForm", () => {
  it("shows Claude configured, the model, both efforts, both limits and this month's use", () => {
    const html = render();
    expect(html).toContain("Claude is configured");
    expect(html).toContain("Claude Opus 5.5");
    expect(html).toContain("US$4 in and US$20 out per million tokens.");
    expect(html).toContain("Medium");
    expect(html).toContain("Low");
    expect(html).toContain('value="10"');
    expect(html).toContain('value="60"');
    expect(html).toContain("38 drafts, 51 quick actions, about US$3.40");
    expect(html).toContain("An estimate");
    expect(html).toContain("The Anthropic Console has the bill.");
  });

  it("asks for the credentials in Vercel when Claude is not configured, and holds no key field", () => {
    const html = render({ configured: false });
    expect(html).toContain("Set the Anthropic credentials in Vercel to use AI writing");
    expect(html).not.toContain("Claude is configured");
    expect(html).not.toMatch(/type="password"|api.?key/i);
  });

  it("says what switching off does", () => {
    expect(render({ value: { ...AI_WRITING_DEFAULTS, enabled: false } })).toContain("Off. Every ✨ button in campaigns is hidden.");
    expect(render()).toContain('aria-checked="true"');
  });

  it("gives every control a label", () => {
    const html = render();
    const ids = [
      "ai-writing-enabled",
      "ai-writing-model",
      "ai-writing-effort-draft",
      "ai-writing-effort-quick",
      "ai-writing-limit-10min",
      "ai-writing-limit-day",
    ];
    for (const id of ids) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`for="${id}"`);
    }
    expect(html).toContain(">Limit per Staff member, per 10 minutes</label>");
    expect(html).toContain(">Limit per Staff member, per day</label>");
    expect(html).toContain(">Effort for whole drafts</label>");
    expect(html).toContain(">Effort for quick actions</label>");
    // Every input, switch and picker is one of those; every other button has a name.
    const controls = [...html.matchAll(/<input\b[^>]*>|<button\b[^>]*role="(?:switch|combobox)"[^>]*>/g)].map((m) => m[0]);
    expect(controls).toHaveLength(ids.length);
    for (const tag of controls) expect(ids).toContain(tag.match(/id="([^"]+)"/)?.[1]);
    for (const tag of [...html.matchAll(/<button\b(?![^>]*role=)[^>]*>/g)].map((m) => m[0])) {
      expect(tag.includes("aria-label=") || /data-slot="button"/.test(tag)).toBe(true);
    }
  });

  it("fits a 375px screen: one column, full-width pickers, the table scrolls inside its box", () => {
    const html = render();
    expect(html).toContain('class="grid min-w-0 gap-4 sm:grid-cols-2"');
    expect(html).not.toMatch(/\bw-\[\d+px\]|min-w-\[(?!0)/);
    const pickers = [...html.matchAll(/<button\b[^>]*role="combobox"[^>]*>/g)].map((m) => m[0]);
    expect(pickers).toHaveLength(3);
    for (const tag of pickers) expect(tag).toMatch(/class="[^"]*\bw-full min-w-0"/);
    expect(html).toContain("min-w-0 overflow-x-auto");
  });

  it("lists the kinds used, and says when the use can't be read", () => {
    const html = render();
    expect(html).toContain("Drafts");
    expect(html).toContain("Block rewrites");
    expect(html).not.toContain("Translations");
    expect(html).toContain("114,000");
    expect(render({ usage: null })).toContain("Couldn&#x27;t read this month&#x27;s use.");
  });
});
