import { describe, it, expect, vi } from "vitest";
import {
  ImportDriveError,
  importFromDrive,
  type ImportDriveDeps,
  type DriveFileMetaLike,
} from "@/lib/media-assets/import-drive";
import type { MediaAsset } from "@/lib/media-assets/types";

function meta(partial: Partial<DriveFileMetaLike> & Pick<DriveFileMetaLike, "id" | "mimeType">): DriveFileMetaLike {
  return {
    name: partial.name ?? "file",
    thumbnailLink: partial.thumbnailLink ?? null,
    size: partial.size ?? null,
    webViewLink: partial.webViewLink ?? `https://drive.google.com/file/d/${partial.id}/view`,
    isFolder: partial.isFolder ?? false,
    ...partial,
  };
}

function asset(partial: Partial<MediaAsset> & Pick<MediaAsset, "id" | "kind" | "name">): MediaAsset {
  return {
    alt_text: null,
    hosted_url: null,
    drive_file_id: null,
    drive_url: null,
    mime_type: null,
    byte_size: null,
    width: null,
    height: null,
    imported_at: null,
    last_used_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function deps(overrides: Partial<ImportDriveDeps> = {}): ImportDriveDeps {
  return {
    resolveUrl: vi.fn(),
    downloadFile: vi.fn(),
    downloadThumbnail: vi.fn().mockResolvedValue(null),
    ingestImageAsset: vi.fn(),
    hostPreviewImage: vi.fn(),
    createMediaAsset: vi.fn(),
    getMediaAssetByDriveFileId: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("importFromDrive", () => {
  it("image MIME downloads and ingests with Drive provenance", async () => {
    const file = meta({
      id: "img1",
      name: "hero.png",
      mimeType: "image/png",
      webViewLink: "https://drive.google.com/file/d/img1/view",
    });
    const created = asset({
      id: "a1",
      kind: "image",
      name: "hero.png",
      hosted_url: "https://cdn.example/hero.webp",
      drive_file_id: "img1",
      drive_url: file.webViewLink,
      imported_at: "2026-07-10T00:00:00Z",
    });
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(file),
      downloadFile: vi.fn().mockResolvedValue(Buffer.from("raw")),
      ingestImageAsset: vi.fn().mockResolvedValue({ asset: created, storagePath: "x.webp" }),
    });

    const result = await importFromDrive({ url: "https://drive.google.com/file/d/img1/view" }, d);

    expect(result.existing).toBe(false);
    expect(result.asset).toEqual(created);
    expect(d.downloadFile).toHaveBeenCalledWith("img1");
    expect(d.ingestImageAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Buffer.from("raw"),
        originalName: "hero.png",
        drive_file_id: "img1",
        drive_url: file.webViewLink,
        imported_at: expect.any(String),
      }),
    );
    expect(d.createMediaAsset).not.toHaveBeenCalled();
  });

  it("video MIME creates link-only Asset without download", async () => {
    const file = meta({
      id: "vid1",
      name: "clip.mp4",
      mimeType: "video/mp4",
      webViewLink: "https://drive.google.com/file/d/vid1/view",
    });
    const created = asset({
      id: "a2",
      kind: "video",
      name: "clip.mp4",
      drive_file_id: "vid1",
      drive_url: file.webViewLink,
    });
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(file),
      createMediaAsset: vi.fn().mockResolvedValue(created),
    });

    const result = await importFromDrive({ fileId: "vid1" }, d);

    expect(result.existing).toBe(false);
    expect(result.asset.kind).toBe("video");
    expect(d.downloadFile).not.toHaveBeenCalled();
    expect(d.ingestImageAsset).not.toHaveBeenCalled();
    expect(d.hostPreviewImage).not.toHaveBeenCalled();
    expect(d.createMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        drive_file_id: "vid1",
        drive_url: file.webViewLink,
        mime_type: "video/mp4",
        hosted_url: null,
        imported_at: expect.any(String),
      }),
    );
  });

  it("video with Drive thumbnail hosts durable preview without downloading the video", async () => {
    const file = meta({
      id: "vid2",
      name: "clip.mp4",
      mimeType: "video/mp4",
      thumbnailLink: "https://example.com/thumb.jpg",
    });
    const created = asset({
      id: "a2b",
      kind: "video",
      name: "clip.mp4",
      drive_file_id: "vid2",
      hosted_url: "https://cdn.example/preview.webp",
    });
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(file),
      downloadThumbnail: vi.fn().mockResolvedValue(Buffer.from("thumb")),
      hostPreviewImage: vi.fn().mockResolvedValue({
        publicUrl: "https://cdn.example/preview.webp",
        storagePath: "preview.webp",
      }),
      createMediaAsset: vi.fn().mockResolvedValue(created),
    });

    await importFromDrive({ fileId: "vid2" }, d);

    expect(d.downloadFile).not.toHaveBeenCalled();
    expect(d.ingestImageAsset).not.toHaveBeenCalled();
    expect(d.downloadThumbnail).toHaveBeenCalledWith(file.thumbnailLink);
    expect(d.hostPreviewImage).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: Buffer.from("thumb"), originalName: "clip.mp4" }),
    );
    expect(d.createMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        hosted_url: "https://cdn.example/preview.webp",
        mime_type: "video/mp4",
      }),
    );
  });

  it("PDF MIME creates link-only Asset without download", async () => {
    const file = meta({
      id: "pdf1",
      name: "spec.pdf",
      mimeType: "application/pdf",
    });
    const created = asset({ id: "a3", kind: "pdf", name: "spec.pdf", drive_file_id: "pdf1" });
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(file),
      createMediaAsset: vi.fn().mockResolvedValue(created),
    });

    await importFromDrive({ fileId: "pdf1" }, d);

    expect(d.createMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pdf", drive_file_id: "pdf1", hosted_url: null }),
    );
    expect(d.downloadFile).not.toHaveBeenCalled();
  });

  it("PDF thumb host failure still creates link Asset", async () => {
    const file = meta({
      id: "pdf2",
      name: "spec.pdf",
      mimeType: "application/pdf",
      thumbnailLink: "https://example.com/thumb.jpg",
    });
    const created = asset({ id: "a3b", kind: "pdf", name: "spec.pdf", drive_file_id: "pdf2" });
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(file),
      downloadThumbnail: vi.fn().mockResolvedValue(Buffer.from("thumb")),
      hostPreviewImage: vi.fn().mockRejectedValue(new Error("upload failed")),
      createMediaAsset: vi.fn().mockResolvedValue(created),
    });

    await importFromDrive({ fileId: "pdf2" }, d);

    expect(d.downloadFile).not.toHaveBeenCalled();
    expect(d.createMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pdf", hosted_url: null }),
    );
  });

  it("duplicate drive_file_id returns existing Asset without ingest", async () => {
    const existing = asset({
      id: "a0",
      kind: "image",
      name: "hero.png",
      drive_file_id: "img1",
      hosted_url: "https://cdn.example/hero.webp",
    });
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(meta({ id: "img1", mimeType: "image/png" })),
      getMediaAssetByDriveFileId: vi.fn().mockResolvedValue(existing),
    });

    const result = await importFromDrive({ fileId: "img1" }, d);

    expect(result).toEqual({ asset: existing, existing: true });
    expect(d.downloadFile).not.toHaveBeenCalled();
    expect(d.ingestImageAsset).not.toHaveBeenCalled();
    expect(d.createMediaAsset).not.toHaveBeenCalled();
  });

  it("unsupported MIME throws unsupported_kind", async () => {
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(
        meta({ id: "doc1", mimeType: "application/vnd.google-apps.document" }),
      ),
    });

    await expect(importFromDrive({ fileId: "doc1" }, d)).rejects.toMatchObject({
      code: "unsupported_kind",
    });
    expect(d.downloadFile).not.toHaveBeenCalled();
  });

  it("folders throw unsupported_kind", async () => {
    const d = deps({
      resolveUrl: vi.fn().mockResolvedValue(
        meta({
          id: "fold1",
          mimeType: "application/vnd.google-apps.folder",
          isFolder: true,
        }),
      ),
    });

    await expect(importFromDrive({ fileId: "fold1" }, d)).rejects.toBeInstanceOf(ImportDriveError);
  });
});
