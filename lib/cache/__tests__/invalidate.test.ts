import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultCacheHandler } from "next/dist/server/lib/cache-handlers/default.js";
import {
  areTagsExpired,
  areTagsStale,
  tagsManifest,
} from "next/dist/server/lib/incremental-cache/tags-manifest.external.js";

const MAX_PROFILE_EXPIRE_SECONDS = 60 * 60 * 24 * 365;

type CacheHandler = {
  updateTags: (tags: string[], durations?: { expire?: number }) => Promise<void>;
};

describe("Next.js cache-tag invalidation profiles", () => {
  let handler: CacheHandler;

  beforeEach(() => {
    tagsManifest.clear();
    handler = createDefaultCacheHandler(1024 * 1024) as CacheHandler;
  });

  it('revalidateTag(tag, "max") is a SOFT invalidation - entry stays readable', async () => {
    const entryTimestamp = Date.now() - 1000;

    await handler.updateTags(["site-settings"], {
      expire: MAX_PROFILE_EXPIRE_SECONDS,
    });

    expect(areTagsExpired(["site-settings"], entryTimestamp)).toBe(false);

    expect(areTagsStale(["site-settings"], entryTimestamp)).toBe(true);

    const entry = tagsManifest.get("site-settings");
    expect(entry?.expired).toBeGreaterThan(Date.now());
  });

  it("revalidateTag(tag, { expire: 0 }) is a HARD expiry - entry is a miss", async () => {
    const entryTimestamp = Date.now() - 1000;

    await handler.updateTags(["site-settings"], { expire: 0 });
    await new Promise((r) => setTimeout(r, 5));

    expect(areTagsExpired(["site-settings"], entryTimestamp)).toBe(true);

    const entry = tagsManifest.get("site-settings");
    expect(entry?.expired).toBeLessThanOrEqual(Date.now());
  });

  it("{ expire: 0 } matches the single-arg / updateTag hard-expiry behaviour", async () => {
    const entryTimestamp = Date.now() - 1000;

    await handler.updateTags(["locations"]);
    await new Promise((r) => setTimeout(r, 5));
    expect(areTagsExpired(["locations"], entryTimestamp)).toBe(true);

    tagsManifest.clear();

    await handler.updateTags(["locations"], { expire: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(areTagsExpired(["locations"], entryTimestamp)).toBe(true);
  });

  it("an entry written AFTER the invalidation is still valid", async () => {
    await handler.updateTags(["categories"], { expire: 0 });

    const freshTimestamp = Date.now() + 1000;
    expect(areTagsExpired(["categories"], freshTimestamp)).toBe(false);
  });
});
