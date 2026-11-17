import { describe, expect, it } from "vitest";

import {
  canonicalTikTokUrl,
  parseTikTokUrl,
  readTikTokPlayerMessage,
  tiktokPlayerSrc,
  tiktokPostId,
  tiktokPostUrl,
} from "@/lib/tiktok/embed";

const ID = "6718335390845095173";

describe("parseTikTokUrl", () => {
  it("reads a post link with its handle", () => {
    expect(parseTikTokUrl(`https://www.tiktok.com/@thempillow/video/${ID}`)).toEqual({
      kind: "post",
      id: ID,
      postType: "video",
      handle: "thempillow",
    });
  });

  it("ignores share tracking and accepts links without a scheme", () => {
    expect(tiktokPostId(`https://www.tiktok.com/@thempillow/video/${ID}?is_from_webapp=1&sender_device=pc`)).toBe(ID);
    expect(tiktokPostId(`tiktok.com/@thempillow/video/${ID}`)).toBe(ID);
    expect(tiktokPostId(`  https://m.tiktok.com/v/${ID}.html  `)).toBe(ID);
  });

  it("reads photo posts, embed and player URLs, and a bare id", () => {
    expect(parseTikTokUrl(`https://www.tiktok.com/@a/photo/${ID}`)).toMatchObject({ postType: "photo", id: ID });
    expect(tiktokPostId(`https://www.tiktok.com/embed/v2/${ID}`)).toBe(ID);
    expect(tiktokPostId(`https://www.tiktok.com/player/v1/${ID}?autoplay=1`)).toBe(ID);
    expect(tiktokPostId(ID)).toBe(ID);
  });

  it("flags share links that must be followed first", () => {
    expect(parseTikTokUrl("https://vt.tiktok.com/ZSabc123/")).toEqual({
      kind: "short",
      url: "https://vt.tiktok.com/ZSabc123/",
    });
    expect(parseTikTokUrl("https://www.tiktok.com/t/ZTabc123/")).toEqual({
      kind: "short",
      url: "https://www.tiktok.com/t/ZTabc123",
    });
    expect(tiktokPostId("https://vm.tiktok.com/ZMabc123/")).toBeNull();
  });

  it("rejects other sites, profiles and look-alike hosts", () => {
    expect(parseTikTokUrl("https://www.youtube.com/watch?v=nvFI6woJD9g")).toBeNull();
    expect(parseTikTokUrl("https://www.tiktok.com/@thempillow")).toBeNull();
    expect(parseTikTokUrl(`https://tiktok.com.evil.example/@a/video/${ID}`)).toBeNull();
    expect(parseTikTokUrl(`https://www.tiktok.com/@a/video/12345`)).toBeNull();
    expect(parseTikTokUrl("")).toBeNull();
    expect(parseTikTokUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("links back to TikTok", () => {
  it("drops tracking and keeps the handle", () => {
    expect(canonicalTikTokUrl(`https://www.tiktok.com/@thempillow/video/${ID}?_r=1`)).toBe(
      `https://www.tiktok.com/@thempillow/video/${ID}`,
    );
  });

  it("uses TikTok's own handle-less form when the link had none", () => {
    expect(tiktokPostUrl({ id: ID })).toBe(`https://www.tiktok.com/@/video/${ID}`);
    // And that form reads back as the same post.
    expect(tiktokPostId(tiktokPostUrl({ id: ID }))).toBe(ID);
  });

  it("has no canonical form for an unresolved share link", () => {
    expect(canonicalTikTokUrl("https://vt.tiktok.com/ZSabc123/")).toBeNull();
  });
});

describe("tiktokPlayerSrc", () => {
  it("keeps the end screen on our own posts unless told otherwise", () => {
    expect(tiktokPlayerSrc(ID)).toBe(`https://www.tiktok.com/player/v1/${ID}?rel=0`);
  });

  it("writes flags as 1/0", () => {
    const src = new URL(tiktokPlayerSrc(ID, { autoplay: true, musicInfo: false, closedCaption: true }));
    expect(src.searchParams.get("autoplay")).toBe("1");
    expect(src.searchParams.get("music_info")).toBe("0");
    expect(src.searchParams.get("closed_caption")).toBe("1");
  });

  it("refuses anything that is not a post id", () => {
    expect(() => tiktokPlayerSrc("../../evil")).toThrow();
  });
});

describe("readTikTokPlayerMessage", () => {
  it("reads player events, as objects or JSON strings", () => {
    expect(
      readTikTokPlayerMessage("https://www.tiktok.com", { "x-tiktok-player": true, type: "onStateChange", value: 0 }),
    ).toEqual({ type: "onStateChange", value: 0 });
    expect(
      readTikTokPlayerMessage("https://www.tiktok.com", JSON.stringify({ "x-tiktok-player": true, type: "onPlayerReady" })),
    ).toEqual({ type: "onPlayerReady", value: undefined });
  });

  it("ignores other origins and other messages", () => {
    expect(readTikTokPlayerMessage("https://evil.example", { "x-tiktok-player": true, type: "onPlayerReady" })).toBeNull();
    expect(readTikTokPlayerMessage("https://www.tiktok.com", { type: "onPlayerReady" })).toBeNull();
    expect(readTikTokPlayerMessage("https://www.tiktok.com", "not json")).toBeNull();
  });
});
