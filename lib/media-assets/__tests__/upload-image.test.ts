import { describe, expect, it, vi } from "vitest";
import { IMAGE_LONG_EDGE_CAP } from "../optimize";
import { UPLOAD_LONG_EDGE, UPLOAD_MAX_BYTES, uploadImage } from "../upload-image";

const ASSET = { id: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f", name: "poster.png", hosted_url: "https://cdn.test/poster.webp", created_at: "2026-11-23T00:00:00Z" };
const answers = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(async () => ({ status, json: async () => (body === undefined ? Promise.reject(new Error("not JSON")) : body) }) as Response);
const sized = (name: string, type: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type });
const sent = (send: ReturnType<typeof answers>) => (send.mock.calls[0][1]!.body as FormData).get("file") as File;
const neverShrinks = vi.fn(async () => null);

describe("uploading an image to the Media Library", () => {
  it("sends a small image as it is and gives back its asset", async () => {
    const send = answers(200, { ok: true, asset: ASSET });
    const file = sized("poster.png", "image/png", 1000);
    expect(await uploadImage(file, { send, shrink: neverShrinks })).toEqual({ ok: true, asset: ASSET });
    expect(send.mock.calls[0][0]).toBe("/api/media");
    expect(sent(send)).toMatchObject({ name: "poster.png", size: 1000, type: "image/png" });
    expect(neverShrinks).not.toHaveBeenCalled();
  });

  it("makes an image over the limit smaller first, under its own name", async () => {
    const send = answers(200, { ok: true, asset: ASSET });
    const shrink = vi.fn(async () => new Blob([new Uint8Array(2000)], { type: "image/jpeg" }));
    const res = await uploadImage(sized("studio photo.jpg", "image/jpeg", UPLOAD_MAX_BYTES + 1), { send, shrink });
    expect(res.ok).toBe(true);
    expect(sent(send)).toMatchObject({ name: "studio photo.jpg", size: 2000, type: "image/jpeg" });
  });

  it("makes it no smaller than the library keeps", () => {
    expect(UPLOAD_LONG_EDGE).toBe(IMAGE_LONG_EDGE_CAP);
  });

  it("says the size when an image can't be made small enough, and sends nothing", async () => {
    const send = answers(200, { ok: true, asset: ASSET });
    const big = sized("banner.png", "image/png", 7_200_000);
    const tooLarge = { ok: false, error: "banner.png is 7.2 MB, which is too large to upload. Save it under 4.0 MB and try again." };
    expect(await uploadImage(big, { send, shrink: neverShrinks })).toEqual(tooLarge);
    expect(await uploadImage(big, { send, shrink: async () => new Blob([new Uint8Array(UPLOAD_MAX_BYTES + 1)]) })).toEqual(tooLarge);
    expect(await uploadImage(big, { send, shrink: async () => Promise.reject(new Error("no canvas")) })).toEqual(tooLarge);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a file that is not an image before sending it", async () => {
    const send = answers(200, { ok: true, asset: ASSET });
    expect(await uploadImage(sized("brief.pdf", "application/pdf", 10), { send })).toEqual({ ok: false, error: "brief.pdf is not an image. Choose a JPG, PNG or WebP file." });
    expect(send).not.toHaveBeenCalled();
  });

  it("always answers with a sentence when the upload fails", async () => {
    const file = sized("poster.png", "image/png", 10);
    expect(await uploadImage(file, { send: answers(500, { error: "Input buffer contains unsupported image format" }) })).toEqual({
      ok: false,
      error: "Input buffer contains unsupported image format",
    });
    expect(await uploadImage(file, { send: answers(500, { error: { formErrors: [] } }) })).toEqual({ ok: false, error: "Couldn't upload poster.png." });
    expect(await uploadImage(file, { send: answers(502, undefined) })).toEqual({ ok: false, error: "Couldn't upload poster.png." });
    expect(await uploadImage(file, { send: answers(413, undefined) })).toEqual({
      ok: false,
      error: "poster.png is 0.0 MB, which is too large to upload. Save it under 4.0 MB and try again.",
    });
    expect(await uploadImage(file, { send: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))) })).toEqual({
      ok: false,
      error: "Couldn't upload poster.png. Check your connection and try again.",
    });
  });
});
