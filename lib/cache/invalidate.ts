import { revalidateTag } from "next/cache";

/**
 * Hard-expire a cache tag immediately.
 *
 * Use this instead of calling `revalidateTag` directly. It exists because the
 * obvious-looking call, `revalidateTag(tag, "max")`, is a *soft* invalidation
 * and silently serves stale data to the very request that saved it.
 *
 * ## Why `{ expire: 0 }`
 *
 * Traced through Next.js 16.2.10 (`node_modules/next`):
 *
 * 1. `server/web/spec-extension/revalidate.d.ts` types the second argument as
 *    `string | CacheLifeConfig` where `CacheLifeConfig = { expire?: number }`,
 *    so an object profile is a supported, type-checked call form.
 *
 * 2. `server/web/spec-extension/revalidate.js` warns *only* when the profile is
 *    absent:
 *
 *        if (!profile) {
 *          console.warn('"revalidateTag" without the second argument is now
 *          deprecated, add second argument of "max" or use "updateTag". ...');
 *        }
 *
 *    `{ expire: 0 }` is truthy, so this form is deprecation-warning free.
 *
 * 3. `server/config-shared.js` (~L167) defines the built-in `"max"` profile as
 *    `{ stale: 300, revalidate: 2592000, expire: 31536000 }` — an expiry a full
 *    year in the future.
 *
 * 4. `server/revalidation-utils.js` turns the profile into
 *    `durations = { expire: cacheLife.expire }` and hands it to the cache
 *    handler's `updateTags(tags, durations)`.
 *
 * 5. `server/lib/cache-handlers/default.js` `updateTags` then writes
 *    `stale = now` and `expired = now + durations.expire * 1000`.
 *
 * 6. `server/lib/incremental-cache/tags-manifest.external.js` reads those back:
 *    `areTagsExpired` requires `expiredAt <= now`, while `areTagsStale` only
 *    requires `staleAt > timestamp`.
 *
 * So with `"max"` the entry is marked stale but its expiry is a year out: the
 * next read passes `areTagsExpired`, hits `areTagsStale`, sets `revalidate = -1`
 * and **returns the stale entry** while refreshing in the background. That is
 * the bug — an admin save flow that refetches immediately reads pre-save data.
 *
 * With `{ expire: 0 }`, `expired = now`, so `areTagsExpired` is true and the
 * handler's `get` returns `undefined`: a genuine hard expiry, next read is a
 * miss.
 *
 * ## Why not `updateTag` / single-arg `revalidateTag`
 *
 * Both are also hard expiries, but neither works everywhere:
 *
 * - `updateTag(tag)` throws `E872` outside a Server Action — it explicitly
 *   rejects route handlers (`workStore.page.endsWith('/route')`), and most of
 *   our call sites are route handlers under `app/api/**`.
 * - single-arg `revalidateTag(tag)` is the deprecated form and logs a warning
 *   on every call.
 *
 * `revalidateTag(tag, { expire: 0 })` is equivalent to both in effect. In
 * `revalidate()` the read-your-own-writes flag is set by
 * `if (!profile || cacheLife?.expire === 0)`, so `{ expire: 0 }` takes the same
 * branch as `updateTag` and marks
 * `pathWasRevalidated = ActionDidRevalidateStaticAndDynamic`. It is therefore
 * safe in Server Actions *and* route handlers, which is why one helper can
 * cover every call site.
 */
export function invalidateTag(tag: string): void {
  revalidateTag(tag, { expire: 0 });
}

/** Hard-expire several cache tags immediately. See {@link invalidateTag}. */
export function invalidateTags(...tags: string[]): void {
  for (const tag of tags) invalidateTag(tag);
}
