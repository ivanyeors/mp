import { describe, expect, it } from "vitest";
import {
  AFTERCARE_EMAIL_FOOTER,
  AFTERCARE_EMAIL_LABEL,
  aftercareWhatsAppWording,
  describeStopRequest,
  describeSwitch,
  isStopRequestOpen,
  mobileForWording,
  type PreferenceEvent,
} from "@/lib/aftercare/state";

const event = (over: Partial<PreferenceEvent> = {}): PreferenceEvent => ({
  preference: "aftercare_whatsapp",
  toValue: false,
  source: "staff",
  profileName: "Mei",
  note: "asked on WhatsApp",
  wording: null,
  createdAt: "2026-10-20T03:00:00Z",
  ...over,
});

describe("the approved Profile copy, word for word", () => {
  it("labels the email toggle", () => {
    expect(AFTERCARE_EMAIL_LABEL).toBe("Emails after a purchase");
  });

  it("states exactly what the WhatsApp toggle agrees to, with the mobile in it", () => {
    expect(aftercareWhatsAppWording(mobileForWording("+6591234567"))).toBe(
      "Mpillow may WhatsApp me at +65 9123 4567 with a review request after delivery and, for a Premium Mpillow, a yearly reminder about a paid re-adjustment visit. I can turn this off here at any time.",
    );
  });

  it("gives the aftercare emails their stop footer", () => {
    expect(AFTERCARE_EMAIL_FOOTER).toBe(
      "You're getting this because you bought from Mpillow. To stop these emails, turn them off in your account, or reply to this email and we'll do it for you.",
    );
  });
});

describe("isStopRequestOpen", () => {
  const stop = "2026-11-03T02:00:00Z";

  it("is open when a STOP is newer than the latest WhatsApp change", () => {
    expect(isStopRequestOpen({ whatsappOn: true, latestStopAt: stop, latestWhatsAppChangeAt: "2026-10-20T00:00:00Z" })).toBe(true);
  });

  it("is open when WhatsApp is on and was never changed since (no event to compare)", () => {
    expect(isStopRequestOpen({ whatsappOn: true, latestStopAt: stop, latestWhatsAppChangeAt: null })).toBe(true);
  });

  it("is closed by any later change", () => {
    expect(isStopRequestOpen({ whatsappOn: true, latestStopAt: stop, latestWhatsAppChangeAt: "2026-11-03T02:00:01Z" })).toBe(false);
  });

  it("is never open with no STOP, or with WhatsApp already off", () => {
    expect(isStopRequestOpen({ whatsappOn: true, latestStopAt: null, latestWhatsAppChangeAt: null })).toBe(false);
    expect(isStopRequestOpen({ whatsappOn: false, latestStopAt: stop, latestWhatsAppChangeAt: null })).toBe(false);
  });
});

describe("describeSwitch", () => {
  it("shows the last change: when, by whom, and the note", () => {
    expect(describeSwitch("aftercare_whatsapp", false, event())).toBe(
      "Off since 20 Oct: switched off by Mei: asked on WhatsApp.",
    );
  });

  it("names a Profile change as the customer's own", () => {
    expect(
      describeSwitch("aftercare_email", true, event({ preference: "aftercare_email", toValue: true, source: "profile", profileName: null, note: null })),
    ).toBe("On since 20 Oct: switched on by the customer in their Profile.");
  });

  it("falls back to Staff when no profile was chosen", () => {
    expect(describeSwitch("aftercare_email", false, event({ preference: "aftercare_email", profileName: null, note: null }))).toBe(
      "Off since 20 Oct: switched off by Staff.",
    );
  });

  it("states each channel's default before any change", () => {
    expect(describeSwitch("aftercare_email", true, null)).toBe("On by default.");
    expect(describeSwitch("aftercare_whatsapp", false, null)).toBe("Off until the customer opts in.");
  });

  it("reads the day in Singapore", () => {
    expect(describeStopRequest("2026-11-02T16:30:00Z")).toBe("Asked to stop on WhatsApp, 3 Nov");
  });
});
