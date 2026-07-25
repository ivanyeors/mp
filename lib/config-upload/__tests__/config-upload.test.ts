import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertUploadAllowed,
  saveConfigUpload,
  UploadRefusedError,
  MAX_FILE_BYTES,
  MAX_IMAGES_PER_SESSION,
} from "@/lib/config-upload";

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  insert: vi.fn(),
  optimize: vi.fn(),
}));

vi.mock("@/lib/media-assets/optimize", () => ({
  optimizeImageForWeb: h.optimize,
  optimizedStorageName: (name?: string) =>
    `${(name ?? "image").replace(/\.[^.]+$/, "")}_123.webp`,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    storage: { from: () => ({ upload: h.upload, getPublicUrl: h.getPublicUrl }) },
    from: () => ({ insert: h.insert }),
  }),
}));

const SID = "11111111-1111-1111-1111-111111111111";

describe("assertUploadAllowed", () => {
  it("accepts a normal image below every limit", () => {
    expect(() => assertUploadAllowed(0, 2_000_000, "image/jpeg")).not.toThrow();
    expect(() => assertUploadAllowed(MAX_IMAGES_PER_SESSION - 1, 1_000, "image/png")).not.toThrow();
  });

  it("rejects the 11th image", () => {
    expect(() => assertUploadAllowed(MAX_IMAGES_PER_SESSION, 1_000, "image/jpeg")).toThrow(
      UploadRefusedError,
    );
  });

  it("rejects a file over 15 MB", () => {
    expect(() => assertUploadAllowed(0, MAX_FILE_BYTES + 1, "image/jpeg")).toThrow(
      /15 MB/,
    );
  });

  it("rejects a non-image mime", () => {
    expect(() => assertUploadAllowed(0, 1_000, "application/pdf")).toThrow(/image/i);
  });
});

describe("saveConfigUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.optimize.mockResolvedValue({
      buffer: Buffer.from("webpbytes"),
      mimeType: "image/webp",
      extension: "webp",
      width: 1200,
      height: 800,
      byteSize: 9,
    });
    h.upload.mockResolvedValue({ error: null });
    h.getPublicUrl.mockReturnValue({
      data: { publicUrl: `https://cdn/media/config-uploads/${SID}/photo_123.webp` },
    });
    h.insert.mockImplementation((row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: { id: "row-1", created_at: "2026-07-26T00:00:00Z", ...row },
          error: null,
        }),
      }),
    }));
  });

  it("optimizes, stores under a per-session path, and inserts a row (no Media Asset)", async () => {
    const result = await saveConfigUpload({
      sessionId: SID,
      bytes: Buffer.from("raw-bytes"),
      originalName: "photo.jpg",
    });

    // compressed once
    expect(h.optimize).toHaveBeenCalledTimes(1);

    // stored under config-uploads/{sessionId}/ as webp, no overwrite
    expect(h.upload).toHaveBeenCalledWith(
      `config-uploads/${SID}/photo_123.webp`,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/webp", upsert: false }),
    );

    // row carries the optimized metadata + hosted url; keyed by session
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: SID,
        storage_path: `config-uploads/${SID}/photo_123.webp`,
        mime_type: "image/webp",
        byte_size: 9,
        width: 1200,
        height: 800,
      }),
    );

    expect(result.sessionId).toBe(SID);
    expect(result.hostedUrl).toBe(`https://cdn/media/config-uploads/${SID}/photo_123.webp`);
    expect(result.storagePath).toBe(`config-uploads/${SID}/photo_123.webp`);
  });

  it("throws when storage upload fails", async () => {
    h.upload.mockResolvedValue({ error: { message: "boom" } });
    await expect(
      saveConfigUpload({ sessionId: SID, bytes: Buffer.from("x"), originalName: "a.png" }),
    ).rejects.toThrow(/boom/);
  });
});
