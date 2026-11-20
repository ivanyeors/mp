import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { AftercareView } from "@/lib/aftercare/state";

const { AftercareCard } = await import("../[id]/aftercare-card");

const view: AftercareView = {
  email: {
    on: false,
    last: {
      preference: "aftercare_email",
      toValue: false,
      source: "staff",
      profileName: "Mei",
      note: "asked on WhatsApp",
      wording: null,
      createdAt: "2026-10-20T03:00:00Z",
    },
  },
  whatsapp: {
    on: true,
    last: {
      preference: "aftercare_whatsapp",
      toValue: true,
      source: "profile",
      profileName: null,
      note: null,
      wording: "Mpillow may WhatsApp me at +65 9123 4567 with a review request after delivery",
      createdAt: "2026-10-19T03:00:00Z",
    },
    stopRequestedAt: "2026-11-03T02:00:00Z",
    marketingOff: true,
  },
  history: [],
};
view.history = [view.email.last!, view.whatsapp.last!];

const render = (canEdit: boolean) =>
  renderToString(<AftercareCard customerId="c1" canEdit={canEdit} initialView={view} />);

const switches = (html: string) => [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);

describe("AftercareCard", () => {
  it("shows a view-only role both switches, disabled, with their last change and history", () => {
    const html = render(false);
    expect(switches(html)).toHaveLength(2);
    for (const s of switches(html)) expect(s).toMatch(/ disabled=""/);
    for (const text of [
      "Aftercare by email",
      "Aftercare by WhatsApp",
      "Off since 20 Oct: switched off by Mei: asked on WhatsApp.",
      "On since 19 Oct: switched on by the customer in their Profile.",
      "Asked to stop on WhatsApp, 3 Nov",
      "Turned off marketing messages in WhatsApp",
      "Mpillow may WhatsApp me at +65 9123 4567",
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it("enables the switches for customers-edit", () => {
    for (const s of switches(render(true))) expect(s).not.toMatch(/ disabled=""/);
  });
});
