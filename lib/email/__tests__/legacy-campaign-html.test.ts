// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { forceDarkMode } from "../base";
import { renderComposedCampaignEmail } from "../campaigns";
import { sampleComposedCampaign } from "../__fixtures__/samples";
import { renderCampaignFor, renderCampaignPreview } from "@/lib/email-campaigns/sender";
import { EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT, type CampaignDraft } from "@/lib/email-campaigns/rules";
import type { RenderedEmail } from "../types";

/**
 * Campaigns written as plain text keep their renderer, byte for byte
 * (PRD-campaign-email-editor decision 5, slice 03). These files were written
 * from the renderer before typed blocks existed, so a change to the shell,
 * the components or the sender that reaches a legacy campaign shows here.
 *
 * The `.txt` files are for good: a legacy campaign's words, order and links
 * never change. The `.html` files may change only where slice 15 improves the
 * shell's light and dark rules for every email: it underlined the footer's
 * links, and changed nothing else.
 */

const ORIGIN = "https://custom.mpillow.com";
const UNSUB = `${ORIGIN}/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc`;

/** A legacy draft as stored: the plain-text body and one button. */
const legacy = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({ ...FIRST_CAMPAIGN_DRAFT, ...over });

const send = (c: CampaignDraft, p: { firstName: string | null; locale?: "en-US" | "zh-CN"; claimUrl?: string | null }) =>
  renderCampaignFor(c, { firstName: p.firstName, origin: ORIGIN, locale: p.locale ?? "en-US", claimUrl: p.claimUrl ?? null, unsubscribeUrl: UNSUB });

const CASES: [name: string, render: () => RenderedEmail][] = [
  ["first-campaign.preview", () => renderCampaignPreview(legacy(), { origin: ORIGIN, firstName: "Ivan" })],
  ["first-campaign.send-claim-link", () => send(legacy(), { firstName: "Ann", locale: "zh-CN", claimUrl: `${ORIGIN}/zh-CN/account/welcome?c=abc` })],
  ["first-campaign.send-account", () => send(legacy(), { firstName: null })],
  [
    "link-button.no-greeting",
    () =>
      send(
        legacy({
          subject: "December & the covers",
          preheader: null,
          greeting: false,
          body: "Our covers are back.\nIn every size.\n\n## Care\n- Wash cold\n- Dry flat\n\nRead https://custom.mpillow.com/en-US/faq, or https://instagram.com/mpillow.",
          button: { target: "url", label: "Shop the covers", url: "https://custom.mpillow.com/en-US/shop" },
        }),
        { firstName: "Bea" },
      ),
  ],
  ["no-button", () => send(legacy({ button: null, body: "Just a note." }), { firstName: "Cal" })],
  [
    "empty.preview",
    () =>
      renderCampaignPreview(
        // An empty legacy draft: a message box, not blocks (a new campaign is blocks now).
        { ...EMPTY_CAMPAIGN_DRAFT, content: null, button: { target: "sign_in", label: "", url: null } },
        { origin: ORIGIN, firstName: "Ivan" },
      ),
  ],
  ["composed.happy", () => renderComposedCampaignEmail(sampleComposedCampaign("happy"))],
  ["composed.hostile", () => renderComposedCampaignEmail(sampleComposedCampaign("hostile"))],
];

// The footer's year is the clock's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("a legacy campaign renders as it did before typed blocks", () => {
  it.each(CASES)("%s", async (name, render) => {
    const r = render();
    await expect(r.html).toMatchFileSnapshot(`./__snapshots__/legacy-campaigns/${name}.html`);
    await expect(`${r.subject}\n\n${r.text}`).toMatchFileSnapshot(`./__snapshots__/legacy-campaigns/${name}.txt`);
  });

  it("is the same email with the preview's Dark on, the shell's dark rules forced (slice 15)", () => {
    for (const draft of [legacy(), legacy({ body: "", subject: "", button: { target: "sign_in", label: "", url: null } })]) {
      const light = renderCampaignPreview(draft, { origin: ORIGIN, firstName: "Ivan" });
      const dark = renderCampaignPreview(draft, { origin: ORIGIN, firstName: "Ivan", forceDark: true });
      expect(dark.html).toBe(forceDarkMode(light.html));
      expect({ subject: dark.subject, text: dark.text }).toEqual({ subject: light.subject, text: light.text });
    }
  });
});
