import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * The Profile's Aftercare messages card (CRM slice 13): the email toggle's
 * label, and the WhatsApp toggle stating exactly what the customer agrees to,
 * with their own number in it.
 */

vi.mock("../actions", () => ({ setMyAftercarePreference: vi.fn() }));

const { AftercarePreferences } = await import("../aftercare-preferences");

describe("AftercarePreferences", () => {
  it("shows both toggles and the approved WhatsApp wording with the number on file", () => {
    const html = renderToString(<AftercarePreferences email={true} whatsapp={false} phone="9123 4567" />);
    expect(html).toContain("Aftercare messages");
    expect(html).toContain("Emails after a purchase");
    expect(html).toContain(
      "Mpillow may WhatsApp me at +65 9123 4567 with a review request after delivery and, for a Premium Mpillow, a yearly reminder about a paid re-adjustment visit. I can turn this off here at any time.",
    );
    expect(html.match(/role="switch"/g)).toHaveLength(2);
  });

  it("asks for a mobile when none valid is on file, rather than showing a number", () => {
    const html = renderToString(<AftercarePreferences email={true} whatsapp={false} phone="12345" />);
    expect(html).toContain("Add a mobile number to turn this on.");
    expect(html).not.toContain("Mpillow may WhatsApp me at");
  });
});
