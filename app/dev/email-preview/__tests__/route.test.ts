// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { forceDarkMode, FORCED_DARK_STYLE_ID } from "@/lib/email/base";
import { GET } from "../[id]/route";

/**
 * GET /dev/email-preview/[id]: one registered email as a document. With
 * `dark=1` it is the same email as a reader in dark mode sees it, the shell's
 * dark rules forced on (PRD-campaign-email-editor slice 15); the plain text
 * and the JSON are always the email as sent.
 */

const get = async (id: string, query: string) =>
  (await GET(new Request(`https://custom.mpillow.com/dev/email-preview/${id}?${query}`), { params: Promise.resolve({ id }) })).text();

describe("/dev/email-preview/[id]", () => {
  it.each(["campaign.blocks", "campaign.composed", "order.order_confirmation"])("%s: Dark forces the shell's dark rules, Light is as sent", async (id) => {
    const light = await get(id, "fixture=happy");
    const dark = await get(id, "fixture=happy&dark=1");
    expect(light).not.toContain(FORCED_DARK_STYLE_ID);
    expect(dark).toBe(forceDarkMode(light));
  });

  it("keeps the plain text and the JSON as sent", async () => {
    expect(await get("campaign.blocks", "fixture=happy&dark=1&format=text")).toBe(await get("campaign.blocks", "fixture=happy&format=text"));
    expect(await get("campaign.blocks", "fixture=happy&dark=1&format=json")).not.toContain(FORCED_DARK_STYLE_ID);
  });
});
