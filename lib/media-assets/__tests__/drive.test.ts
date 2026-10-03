import { describe, it, expect } from "vitest";
import { buildSearchQuery, parseDriveFileId } from "@/lib/media-assets/drive";

describe("parseDriveFileId", () => {
  it("parses /file/d/{id}/view URLs", () => {
    expect(
      parseDriveFileId("https://drive.google.com/file/d/1AbC_def-GHI123/view?usp=sharing"),
    ).toBe("1AbC_def-GHI123");
  });

  it("parses /folders/{id} URLs", () => {
    expect(parseDriveFileId("https://drive.google.com/drive/folders/0AMgW7WI0ICkvUk9PVA")).toBe(
      "0AMgW7WI0ICkvUk9PVA",
    );
  });

  it("parses open?id= and uc?id=", () => {
    expect(parseDriveFileId("https://drive.google.com/open?id=1AbC_def-GHI123")).toBe(
      "1AbC_def-GHI123",
    );
    expect(parseDriveFileId("https://drive.google.com/uc?id=1AbC_def-GHI123&export=download")).toBe(
      "1AbC_def-GHI123",
    );
  });

  it("parses Docs/Sheets URLs", () => {
    expect(
      parseDriveFileId("https://docs.google.com/document/d/1AbC_def-GHI123/edit"),
    ).toBe("1AbC_def-GHI123");
  });

  it("accepts bare ids", () => {
    expect(parseDriveFileId("0AMgW7WI0ICkvUk9PVA")).toBe("0AMgW7WI0ICkvUk9PVA");
  });

  it("rejects garbage", () => {
    expect(parseDriveFileId("")).toBeNull();
    expect(parseDriveFileId("not a url")).toBeNull();
    expect(parseDriveFileId("https://example.com/foo")).toBeNull();
  });
});

describe("buildSearchQuery", () => {
  it("escapes quotes and backslashes and limits to importable kinds", () => {
    const q = buildSearchQuery(" it's a\\b ");
    expect(q).toContain("name contains 'it\\'s a\\\\b'");
    expect(q).toContain("trashed=false");
    expect(q).toContain("mimeType contains 'image/'");
  });

  it("narrows to one kind", () => {
    const q = buildSearchQuery("x", "pdf");
    expect(q).toContain("mimeType = 'application/pdf'");
    expect(q).not.toContain("image/");
  });
});
