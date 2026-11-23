import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guestText } from "@/lib/appointments/messages";
import {
  askBeforeCancel,
  parseInboundActions,
  sendCancelMessage,
  sendTemplateMessage,
  sendVisitDayCancelQuestion,
  WhatsAppSendError,
} from "@/lib/appointments/whatsapp";

const text = (body: string) => ({
  entry: [{ changes: [{ value: { messages: [{ id: "wamid.1", from: "6591234567", type: "text", text: { body } }] } }] }],
});

describe("the stop intent", () => {
  it.each(["stop", "STOP", " Stop ", "unsubscribe", "Stop messages", "stop sending"])("%j is a stop", (body) => {
    expect(parseInboundActions(text(body))).toEqual([{ kind: "stop", fromE164: "+6591234567", messageId: "wamid.1" }]);
  });

  it.each(["please stop calling me", "stop it", "don't stop"])("%j is chatter, not a stop", (body) => {
    expect(parseInboundActions(text(body))).toMatchObject([{ kind: "unknown" }]);
  });
});

describe("cancel words", () => {
  it.each(["cancel", "Cancel please", "please cancel"])("%j is a bare cancel", (body) => {
    expect(parseInboundActions(text(body))).toEqual([
      { kind: "cancel", fromE164: "+6591234567", messageId: "wamid.1", bare: true, anyway: false },
    ]);
  });

  it.each(["cancel appointment", "Cancel booking"])("%j says what it cancels", (body) => {
    expect(parseInboundActions(text(body))).toMatchObject([{ kind: "cancel", bare: false, anyway: false }]);
  });

  it.each(["cancel anyway", "Cancel Anyway ", '"cancel anyway"', "“Cancel anyway”", "Cancel anyway.", "cancel anyway!"])(
    "%j confirms a cancel after the visit-day warning",
    (body) => {
      expect(parseInboundActions(text(body))).toMatchObject([{ kind: "cancel", bare: false, anyway: true }]);
    },
  );

  it.each(['"cancel appointment"', "Cancel booking.", "cancel."])("%j still reads as a cancel", (body) => {
    expect(parseInboundActions(text(body))).toMatchObject([{ kind: "cancel" }]);
  });
});

describe("the Cancel anyway button", () => {
  const tap = (id: string, title = "Cancel anyway") => ({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: "wamid.1", from: "6591234567", type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } },
              ],
            },
          },
        ],
      },
    ],
  });

  it("is a cancel anyway for the appointment it was sent about, its id kept as sent", () => {
    expect(parseInboundActions(tap("cancel_anyway:Ev7kQ2abc"))).toEqual([
      { kind: "cancel", fromE164: "+6591234567", messageId: "wamid.1", bare: false, anyway: true, eventId: "Ev7kQ2abc" },
    ]);
  });

  it("leaves the other cancel-like buttons as they were", () => {
    expect(parseInboundActions(tap("none_of_these", "None of these"))).toMatchObject([{ kind: "reject_slots" }]);
    expect(parseInboundActions(tap("cancel", "Cancel"))).toMatchObject([{ kind: "reject_slots" }]);
  });
});

describe("askBeforeCancel", () => {
  const reminder = "2026-11-02T01:00:00Z";

  it("asks when the latest aftercare send is newer than the reminder's latest message", () => {
    expect(askBeforeCancel({ bare: true, lastAftercareSentAt: "2026-11-03T01:00:00Z", reminderLastOutboundAt: reminder })).toBe(true);
    expect(askBeforeCancel({ bare: true, lastAftercareSentAt: "2026-11-03T01:00:00Z", reminderLastOutboundAt: null })).toBe(true);
  });

  it("cancels as today with no aftercare send since the reminder", () => {
    expect(askBeforeCancel({ bare: true, lastAftercareSentAt: "2026-11-01T01:00:00Z", reminderLastOutboundAt: reminder })).toBe(false);
    expect(askBeforeCancel({ bare: true, lastAftercareSentAt: null, reminderLastOutboundAt: reminder })).toBe(false);
  });

  it("never asks for a cancel that names the appointment", () => {
    expect(askBeforeCancel({ bare: false, lastAftercareSentAt: "2026-11-03T01:00:00Z", reminderLastOutboundAt: reminder })).toBe(false);
  });
});

describe("the approved free-text replies, word for word", () => {
  it("the auto-reply no longer says appointment messages", () => {
    expect(guestText.autoReply()).toBe(
      "Hi! This number only sends automated messages from Mpillow, so no one here will see your reply. Please message our team on WhatsApp at +65 8780 5311.",
    );
    expect(guestText.autoReply()).not.toContain("appointment messages");
  });

  it("the stop reply", () => {
    expect(guestText.stopReply()).toBe(
      "Thanks, we'll switch off aftercare messages for you. You can also turn them off yourself in your Mpillow account.",
    );
  });

  it("the cancel question", () => {
    expect(guestText.cancelQuestion("2026-11-03T06:00:00Z")).toBe(
      'Do you want to cancel your appointment on Tue 3 Nov 2026 at 14:00? Reply "cancel appointment" to cancel it. To stop aftercare messages, reply "stop".',
    );
  });
});

describe("the cancel message", () => {
  const p = {
    guestName: "Ana",
    typeLabel: "Re-adjustment",
    startsAt: "2026-11-03T06:00:00Z",
    bookingUrl: "https://example.com/book",
  };

  it("adds how long a refund takes below the questions line, only when asked", () => {
    expect(guestText.cancelled({ ...p, mentionRefundTime: true }).split("\n\n").slice(-2)).toEqual([
      "If you have any questions, please message our team on WhatsApp at +65 8780 5311.",
      "If your fee is refunded, please expect it to take 5–10 business days to be processed.",
    ]);
    expect(guestText.cancelled(p)).not.toContain("business days");
  });
});

describe("sendTemplateMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "sender";
    process.env.WHATSAPP_TOKEN = "token";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
  });

  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it("sends body parameters only when no URL button is given, exactly as before", async () => {
    expect(await sendTemplateMessage("+6591234567", "partner_referral_earned", ["Ana", "S$20"])).toBe("wamid.out");
    expect(sentBody()).toEqual({
      messaging_product: "whatsapp",
      to: "6591234567",
      type: "template",
      template: {
        name: "partner_referral_earned",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "S$20" }] }],
      },
    });
  });

  it("adds the URL button's parameter when given one", async () => {
    await sendTemplateMessage("+6591234567", "aftercare_review_request", ["Ivan"], { urlButtonParam: "Zx81kQ" });
    expect(sentBody().template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Ivan" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "Zx81kQ" }] },
    ]);
  });

  it("asks about a visit-day cancel with one Cancel anyway reply button tied to the appointment", async () => {
    const fee = { amount: 30, currency: "SGD" };
    await sendVisitDayCancelQuestion("+6591234567", "evt-1", "2026-11-03T06:00:00Z", fee);
    expect(sentBody()).toEqual({
      messaging_product: "whatsapp",
      to: "6591234567",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: guestText.visitDayCancelQuestion("2026-11-03T06:00:00Z", fee) },
        action: { buttons: [{ type: "reply", reply: { id: "cancel_anyway:evt-1", title: "Cancel anyway" } }] },
      },
    });
    expect(sentBody().interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });

  it("sends the refund-time line in the free-text cancel message", async () => {
    const p = { guestName: "Ana", typeLabel: "Re-adjustment", startsAt: "2026-11-03T06:00:00Z", bookingUrl: "https://example.com/book" };
    await sendCancelMessage("+6591234567", { ...p, mentionRefundTime: true }, { within24h: true });
    expect(sentBody().text.body).toBe(guestText.cancelled({ ...p, mentionRefundTime: true }));
    expect(sentBody().text.body).toContain("5–10 business days");
  });

  it("throws a WhatsAppSendError carrying Meta's code", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unable to deliver", code: 131050 } }), { status: 400 }),
    );
    const err = await sendTemplateMessage("+6591234567", "aftercare_checkup", ["Ivan"]).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppSendError);
    expect(err).toMatchObject({ status: 400, code: 131050, message: "WhatsApp send failed (400): Unable to deliver" });
  });
});
