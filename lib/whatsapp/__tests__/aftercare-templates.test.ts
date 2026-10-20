import { describe, expect, it } from "vitest";
import {
  AFTERCARE_CHECKUP_TEMPLATE,
  AFTERCARE_REVIEW_TEMPLATE,
  AFTERCARE_WA_TEMPLATES,
  aftercareDateSgt,
  checkupTemplateParams,
  reviewRequestTemplateParams,
  templateParamCount,
} from "@/lib/whatsapp/aftercare-templates";

/**
 * The two aftercare templates (CRM slice 13). The copy is approved by the owner
 * word for word on 2026-10-20, so it is pinned here: an edit fails this test
 * rather than reaching Meta. A real change needs the owner and a new name.
 */

describe("the approved copy", () => {
  it("aftercare_review_request", () => {
    expect(AFTERCARE_REVIEW_TEMPLATE).toEqual({
      name: "aftercare_review_request",
      env: "WHATSAPP_TEMPLATE_AFTERCARE_REVIEW",
      category: "UTILITY",
      language: "en",
      text: [
        "Hi {{1}}, your order {{2}} ({{3}}) was delivered on {{4}}. We'd love to hear how it's going: you can leave us a Google review with the button below.",
        "If you need anything else, message our team on WhatsApp at {{5}}.",
        "To stop these messages, turn them off in your Mpillow account, or tell our team.",
      ].join("\n\n"),
      example: ["Ivan", "#1042", "Premium Mpillow", "3 Nov 2026", "+65 8780 5311"],
      urlButton: {
        text: "Write a Google review",
        url: "https://mpillow.com/r/review?t={{1}}",
        example: "https://mpillow.com/r/review?t=Zx81kQ",
      },
    });
  });

  it("aftercare_checkup", () => {
    expect(AFTERCARE_CHECKUP_TEMPLATE).toMatchObject({
      name: "aftercare_checkup",
      env: "WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP",
      category: "UTILITY",
      language: "en",
      text: [
        "Hi {{1}}, your {{2}} from order {{3}} is due for its yearly re-adjustment, which keeps it fitted to you.",
        "A re-adjustment is a paid visit: {{4}}, paid when you book. Use the button below to pick a time, or message our team on WhatsApp at {{5}}.",
        "To stop these reminders, turn them off in your Mpillow account, or tell our team.",
      ].join("\n\n"),
      example: ["Ivan", "Premium Mpillow", "#1042", "S$30", "+65 8780 5311"],
      urlButton: { text: "Book a re-adjustment", url: "https://mpillow.com/appointments?type=readjustment&item={{1}}" },
    });
  });
});

describe.each(AFTERCARE_WA_TEMPLATES.map((t) => [t.name, t] as const))("%s follows Meta's rules", (_name, t) => {
  it("takes five body params, one sample each", () => {
    expect(templateParamCount(t.text)).toBe(5);
    expect(t.example).toHaveLength(5);
  });

  it("starts and ends with fixed text, with no two variables side by side", () => {
    expect(t.text).not.toMatch(/^\{\{/);
    expect(t.text).not.toMatch(/\}\}[.\s]*$/);
    expect(t.text).not.toMatch(/\}\}\s*\{\{/);
  });

  it("has one URL button whose single variable ends the URL, under Meta's 25-character label limit", () => {
    expect(t.urlButton.url).toMatch(/^https:\/\/[^{]+\{\{1\}\}$/);
    expect(t.urlButton.example.startsWith(t.urlButton.url.replace("{{1}}", ""))).toBe(true);
    expect(t.urlButton.text.length).toBeLessThanOrEqual(25);
  });

  it("names the staffed sales line, never a price or another product", () => {
    expect(t.example[4]).toBe("+65 8780 5311");
    expect(t.text).not.toMatch(/S\$\d|discount|offer|%/i);
  });
});

describe("the parameter builders slices 07 and 08 send with", () => {
  it("review request: name, order, product, delivery date (SGT), sales line; the token in the button", () => {
    expect(
      reviewRequestTemplateParams({
        firstName: "Ivan",
        orderNumber: "MP-20261020-1042",
        product: "Premium Mpillow",
        deliveredAt: "2026-11-02T17:00:00Z",
        token: "Zx81kQ",
      }),
    ).toEqual({
      bodyParams: ["Ivan", "#MP-20261020-1042", "Premium Mpillow", "3 Nov 2026", "+65 8780 5311"],
      urlButtonParam: "Zx81kQ",
    });
  });

  it("check-up: name, product, order, fee, sales line; the order item in the button", () => {
    expect(
      checkupTemplateParams({ firstName: null, product: "Premium Mpillow", orderNumber: "#1042", fee: "S$30", orderItemId: "oi-1" }),
    ).toEqual({ bodyParams: ["there", "Premium Mpillow", "#1042", "S$30", "+65 8780 5311"], urlButtonParam: "oi-1" });
  });

  it("greets a customer with no first name as \"there\", and keeps every param one clean line", () => {
    const p = reviewRequestTemplateParams({
      firstName: "  ",
      orderNumber: "1042",
      product: "Premium\n Mpillow",
      deliveredAt: "2026-11-03T00:00:00Z",
      token: "t",
    });
    expect(p.bodyParams.slice(0, 3)).toEqual(["there", "#1042", "Premium Mpillow"]);
  });

  it("refuses a check-up with no fee, so nothing is sent", () => {
    expect(() =>
      checkupTemplateParams({ firstName: "Ivan", product: "Premium Mpillow", orderNumber: "1042", fee: " ", orderItemId: "oi-1" }),
    ).toThrow(/fee/);
  });

  it("formats the delivery date as a Singapore day", () => {
    expect(aftercareDateSgt("2026-11-02T16:00:00Z")).toBe("3 Nov 2026");
  });
});
