import { describe, expect, it, vi } from "vitest";
import { newResponseId, sessionKeyFor, tokenKeyFor } from "@/lib/mp-config/flow-variant";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("session storage keys", () => {
  it("scopes the id per variant", () => {
    expect(sessionKeyFor("basic")).not.toBe(sessionKeyFor("full"));
  });

  it("scopes the token per variant", () => {
    expect(tokenKeyFor("basic")).not.toBe(tokenKeyFor("full"));
  });

  // The bug this guards: one surface overwriting the other's token while the
  // ids stay separate, so /mp-basic silently stops being the Owner of its Result.
  it("never collides an id key with a token key", () => {
    const keys = [
      sessionKeyFor("basic"),
      sessionKeyFor("full"),
      tokenKeyFor("basic"),
      tokenKeyFor("full"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("newResponseId", () => {
  it("returns a v4 uuid when crypto.randomUUID exists", () => {
    expect(newResponseId()).toMatch(UUID_V4);
  });

  // The route validates with z.string().uuid(); the old fallback produced
  // `${Date.now()}-${Math.random()}`, which it rejected with a swallowed 400.
  it("still returns a v4 uuid without crypto.randomUUID", () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      undefined as unknown as `${string}-${string}-${string}-${string}-${string}`,
    );
    try {
      vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
      expect(newResponseId()).toMatch(UUID_V4);
    } finally {
      vi.unstubAllGlobals();
      spy.mockRestore();
    }
  });

  it("still returns a v4 uuid with no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      expect(newResponseId()).toMatch(UUID_V4);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newResponseId()));
    expect(ids.size).toBe(200);
  });
});
