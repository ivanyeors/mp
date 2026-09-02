import { beforeEach, describe, expect, it } from "vitest";

// These are Next.js internals, imported deliberately. The point of this suite is
// to pin the *actual* runtime behaviour of the cache-tag profiles that
// `lib/cache/invalidate.ts` depends on, so that a Next upgrade which changes
// them fails here rather than silently reintroducing stale admin reads.
import { createDefaultCacheHandler } from "next/dist/server/lib/cache-handlers/default.js";
import {
  areTagsExpired,
  areTagsStale,
  tagsManifest,
} from "next/dist/server/lib/incremental-cache/tags-manifest.external.js";

// The built-in "max" profile, from next/dist/server/config-shared.js (~L167).
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
    // Timestamp of a cache entry written before the invalidation.
    const entryTimestamp = Date.now() - 1000;

    // This is what revalidation-utils.js passes for the "max" profile.
    await handler.updateTags(["site-settings"], {
      expire: MAX_PROFILE_EXPIRE_SECONDS,
    });

    // Not expired: `expired` was set a year into the future, and areTagsExpired
    // requires `expiredAt <= now`.
    expect(areTagsExpired(["site-settings"], entryTimestamp)).toBe(false);

    // Only stale => the default handler's `get` sets revalidate = -1 and still
    // RETURNS the stale entry, revalidating in the background. Pre-save data.
    expect(areTagsStale(["site-settings"], entryTimestamp)).toBe(true);

    const entry = tagsManifest.get("site-settings");
    expect(entry?.expired).toBeGreaterThan(Date.now());
  });

  it("revalidateTag(tag, { expire: 0 }) is a HARD expiry - entry is a miss", async () => {
    const entryTimestamp = Date.now() - 1000;

    await handler.updateTags(["site-settings"], { expire: 0 });
    // The handler stamps with performance.timeOrigin + performance.now() while
    // areTagsExpired compares against Date.now(); give the two clocks a moment.
    await new Promise((r) => setTimeout(r, 5));

    // areTagsExpired is true => the handler's `get` returns undefined.
    expect(areTagsExpired(["site-settings"], entryTimestamp)).toBe(true);

    const entry = tagsManifest.get("site-settings");
    expect(entry?.expired).toBeLessThanOrEqual(Date.now());
  });

  it("{ expire: 0 } matches the single-arg / updateTag hard-expiry behaviour", async () => {
    const entryTimestamp = Date.now() - 1000;

    // No durations is what updateTag() and single-arg revalidateTag() produce.
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

    // areTagsExpired also requires `expiredAt > timestamp`, so a fresh entry
    // written after the save is not thrown away.
    const freshTimestamp = Date.now() + 1000;
    expect(areTagsExpired(["categories"], freshTimestamp)).toBe(false);
  });
});
