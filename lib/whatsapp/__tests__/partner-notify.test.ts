import { describe, expect, it } from "vitest";
import { decidePartnerWa } from "@/lib/whatsapp/partner-notify";

const base = {
  transportConfigured: true,
  templateName: "partner_referral_earned",
  notifyWhatsapp: true,
  contactMobile: "87805311",
};

describe("decidePartnerWa — additive WhatsApp channel gate (#86)", () => {
  it("sends to a normalized E.164 when opted in with a valid mobile", () => {
    const d = decidePartnerWa(base);
    expect(d).toEqual({ ok: true, e164: "+6587805311", templateName: "partner_referral_earned" });
  });

  it("skips silently when transport is unconfigured (env not set)", () => {
    expect(decidePartnerWa({ ...base, transportConfigured: false })).toEqual({
      ok: false,
      skip: "transport_unconfigured",
    });
  });

  it("skips silently when the approved template name is not set yet", () => {
    expect(decidePartnerWa({ ...base, templateName: null })).toEqual({
      ok: false,
      skip: "template_unconfigured",
    });
  });

  it("skips when the partner has not opted in (default off)", () => {
    expect(decidePartnerWa({ ...base, notifyWhatsapp: false })).toEqual({
      ok: false,
      skip: "opted_out",
    });
    // undefined (column absent / null) is also opted-out, never a send
    expect(decidePartnerWa({ ...base, notifyWhatsapp: undefined }).ok).toBe(false);
  });

  it("skips when the application mobile is missing or invalid", () => {
    expect(decidePartnerWa({ ...base, contactMobile: "" }).ok).toBe(false);
    expect(decidePartnerWa({ ...base, contactMobile: "not-a-number" })).toEqual({
      ok: false,
      skip: "no_phone",
    });
  });

  it("normalizes +65 and 65-prefixed SG numbers", () => {
    expect(decidePartnerWa({ ...base, contactMobile: "+65 8780 5311" })).toMatchObject({
      ok: true,
      e164: "+6587805311",
    });
    expect(decidePartnerWa({ ...base, contactMobile: "6587805311" })).toMatchObject({
      ok: true,
      e164: "+6587805311",
    });
  });
});
