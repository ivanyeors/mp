import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  PHOTO_NOT_USABLE,
  PHOTO_SCREENING_MODEL,
  photoScreeningParams,
  photoScreeningVerdict,
  screenSizingPhoto,
  screenableImage,
  type PhotoScreeningAnswer,
} from "@/lib/ai/photo-screening";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString("base64");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]).toString("base64");
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic")]).toString("base64");

const good: PhotoScreeningAnswer = { real_person: true, view: "front", head_and_shoulders: true, explicit: false };

describe("photoScreeningVerdict", () => {
  it("keeps a real person, in the view asked for, head and shoulders in the picture", () => {
    expect(photoScreeningVerdict(good, "front")).toEqual({ ok: true });
    expect(photoScreeningVerdict({ ...good, view: "side" }, "side")).toEqual({ ok: true });
  });

  it("turns down anything explicit first, whatever else is true", () => {
    const v = photoScreeningVerdict({ ...good, explicit: true }, "front");
    expect(v).toEqual({ ok: false, reason: expect.stringContaining("fitted top") });
  });

  it("turns down a photo with no real person", () => {
    const v = photoScreeningVerdict({ ...good, real_person: false, view: "other" }, "side");
    expect(v).toEqual({ ok: false, reason: expect.stringContaining("couldn't see a person") });
  });

  it("takes a photo from behind in the front slot, as the configurator's own example is", () => {
    expect(photoScreeningVerdict({ ...good, view: "back" }, "front")).toEqual({ ok: true });
    expect(photoScreeningVerdict({ ...good, view: "back" }, "side")).toMatchObject({ ok: false });
  });

  it("turns down the wrong view, saying how to take the right one", () => {
    expect(photoScreeningVerdict({ ...good, view: "side" }, "front")).toEqual({
      ok: false,
      reason: "This doesn't look like a front view. Stand straight, facing the camera or with your back to it, so both shoulders are in the picture.",
    });
    expect(photoScreeningVerdict(good, "side")).toEqual({
      ok: false,
      reason: "This doesn't look like a side view. Turn side-on so we can see the side of your head, neck and shoulder.",
    });
  });

  it("turns down a photo that cuts off the head or shoulders", () => {
    const v = photoScreeningVerdict({ ...good, head_and_shoulders: false }, "front");
    expect(v).toEqual({ ok: false, reason: expect.stringContaining("Step back") });
  });
});

describe("screenableImage", () => {
  it("types the image by its bytes, not by what the data URL claims", () => {
    expect(screenableImage(`data:image/png;base64,${PNG}`)).toEqual({ mediaType: "image/png", base64: PNG });
    expect(screenableImage(`data:image/png;base64,${JPEG}`)?.mediaType).toBe("image/jpeg");
    expect(screenableImage(`data:image/webp;base64,${WEBP}`)?.mediaType).toBe("image/webp");
    expect(screenableImage(`data:image/gif;base64,${Buffer.from("GIF89a....").toString("base64")}`)?.mediaType).toBe("image/gif");
  });

  it("refuses what Claude can't read: HEIC, junk, or not a data URL", () => {
    expect(screenableImage(`data:image/heic;base64,${HEIC}`)).toBeNull();
    expect(screenableImage(`data:image/png;base64,${"A".repeat(64)}`)).toBeNull();
    expect(screenableImage("https://example.com/me.jpg")).toBeNull();
  });
});

describe("photoScreeningParams", () => {
  it("asks Claude Haiku 5.5 at low effort for structured answers, with no fallbacks", () => {
    const params = photoScreeningParams({ mediaType: "image/png", base64: PNG });
    expect(params.model).toBe(PHOTO_SCREENING_MODEL);
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config?.effort).toBe("low");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("temperature");
    const content = params.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: PNG } });
    expect(params.messages.at(-1)?.role).toBe("user");
  });

  it("doesn't tell Claude which view to expect, so it says what it sees", () => {
    const params = photoScreeningParams({ mediaType: "image/png", base64: PNG });
    expect(JSON.stringify(params.messages)).not.toMatch(/front view|side view/i);
  });
});

function fakeClient(answer: { text?: string; stop_reason?: string; model?: string } | Error) {
  const calls: { params: unknown; opts: unknown }[] = [];
  const client = {
    messages: {
      create: async (params: unknown, opts: unknown) => {
        calls.push({ params, opts });
        if (answer instanceof Error) throw answer;
        return {
          model: answer.model ?? PHOTO_SCREENING_MODEL,
          stop_reason: answer.stop_reason ?? "end_turn",
          content: [{ type: "thinking", thinking: "", signature: "s" }, ...(answer.text ? [{ type: "text", text: answer.text }] : [])],
          usage: { input_tokens: 2500, output_tokens: 120 },
        };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const image = { mediaType: "image/png" as const, base64: PNG };

describe("screenSizingPhoto", () => {
  it("passes a good photo and names the model that served it", async () => {
    const { client, calls } = fakeClient({ text: JSON.stringify(good) });
    expect(await screenSizingPhoto(image, "front", { client })).toEqual({ status: "passed", model: PHOTO_SCREENING_MODEL });
    expect(calls[0].opts).toEqual({ timeout: 20_000, maxRetries: 1 });
  });

  it("rejects with the verdict's reason", async () => {
    const { client } = fakeClient({ text: JSON.stringify({ ...good, view: "other" }) });
    const result = await screenSizingPhoto(image, "front", { client });
    expect(result).toEqual({ status: "rejected", reason: expect.stringContaining("front view") });
  });

  it("rejects when Claude refuses: it won't process an explicit image at all", async () => {
    const { client } = fakeClient({ stop_reason: "refusal" });
    expect(await screenSizingPhoto(image, "front", { client })).toEqual({ status: "rejected", reason: PHOTO_NOT_USABLE });
  });

  it("rejects an answer it can't read", async () => {
    for (const answer of [{ text: "not json" }, { text: JSON.stringify({ view: "front" }) }, { text: JSON.stringify(good), stop_reason: "max_tokens" }]) {
      const { client } = fakeClient(answer);
      expect(await screenSizingPhoto(image, "front", { client })).toEqual({ status: "rejected", reason: PHOTO_NOT_USABLE });
    }
  });

  it("leaves a photo unchecked when Claude can't be reached or isn't configured", async () => {
    const { client } = fakeClient(new Anthropic.APIConnectionError({ message: "Connection error." }));
    expect(await screenSizingPhoto(image, "side", { client, timeoutMs: 8_000, maxRetries: 0 })).toEqual({
      status: "unchecked",
      error: expect.stringContaining("Connection error"),
    });
    expect(await screenSizingPhoto(image, "side", { client: null })).toEqual({ status: "unchecked", error: "Claude is not configured" });
  });
});
