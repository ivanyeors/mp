import { describe, expect, it } from "vitest";
import { MAX_REPLY_CHARS, checkReplyText, normalizeReplyText, replyWarnings } from "@/lib/reviews/reply-rules";

describe("reply rules", () => {
  it("passes a plain, specific reply without warnings", () => {
    expect(replyWarnings("Thank you, Jane! We're glad the adjustable height suits your side sleeping.")).toEqual([]);
  });

  it("warns on links, phone numbers, emails and incentives", () => {
    expect(replyWarnings("See https://mpillow.com")).toHaveLength(1);
    expect(replyWarnings("Visit mpillow.com")).toHaveLength(1);
    expect(replyWarnings("Call us on +65 8809 7571")).toHaveLength(1);
    expect(replyWarnings("Email hello@mpillow.com")).toEqual(expect.arrayContaining([expect.stringMatching(/email/)]));
    expect(replyWarnings("Here is a voucher for 15% off")).toHaveLength(1);
  });

  it("expects our WhatsApp support line, but still flags any other number", () => {
    expect(replyWarnings("Please WhatsApp us on +65 8780 5311.")).toEqual([]);
    expect(replyWarnings("Please WhatsApp us on 8780 5311.")).toEqual([]);
    // The automated appointment sender: nobody reads messages sent to it.
    expect(replyWarnings("Message +65 8809 7571")).toEqual([expect.stringMatching(/other than our WhatsApp support line/)]);
  });

  it("flags a service-recovery reply that does not send them to WhatsApp", () => {
    expect(replyWarnings("We're truly sorry about the delay.", { style: "service_recovery" })).toEqual([
      expect.stringMatching(/Doesn't ask them to WhatsApp us on \+65 8780 5311/),
    ]);
    expect(replyWarnings("Sorry — WhatsApp us at +65 8780 5311.", { style: "service_recovery" })).toEqual([]);
    expect(replyWarnings("Thank you so much!", { style: "thank_you" })).toEqual([]);
  });

  it("warns when a recovery reply promises compensation in public", () => {
    expect(replyWarnings("We will refund your purchase in full.")).toEqual([
      expect.stringMatching(/refund or compensation/),
    ]);
    expect(replyWarnings("A complimentary re-adjustment is yours.")).toHaveLength(1);
    expect(replyWarnings("Please feel free to message our support team.")).toEqual([]);
  });

  it("strips wrapping quotes but keeps inner ones", () => {
    expect(normalizeReplyText('  "Thanks for visiting!"  ')).toBe("Thanks for visiting!");
    expect(normalizeReplyText("“Thanks!”")).toBe("Thanks!");
    expect(normalizeReplyText('"Our "fit" session" ok')).toBe('"Our "fit" session" ok');
  });

  it("refuses empty and over-long replies", () => {
    expect(checkReplyText("   ")).toEqual({ ok: false, error: "The reply is empty." });
    expect(checkReplyText("a".repeat(MAX_REPLY_CHARS + 1)).ok).toBe(false);
    expect(checkReplyText("Thanks!")).toEqual({ ok: true, text: "Thanks!" });
  });
});
