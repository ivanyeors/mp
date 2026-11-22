import { unstable_cache } from "next/cache";
import {
  getDiscoverySourceCatalogOrThrow,
  parseDiscoverySourceCatalog,
  type DiscoverySourceCatalog,
} from "./index";

const readStoredCatalog = unstable_cache(
  () => getDiscoverySourceCatalogOrThrow(),
  ["discovery-source-catalog"],
  { tags: ["site-settings"], revalidate: 300 },
);

export async function readDiscoverySourceCatalog(): Promise<DiscoverySourceCatalog> {
  try {
    return await readStoredCatalog();
  } catch (err) {
    console.error("[readDiscoverySourceCatalog]", err instanceof Error ? err.message : err);
    // ponytail: a failed read with nothing cached yet (cold start, or just after a Forms save) shows the
    // default catalog for that one request and is not cached; an option the owner archived can be offered
    // then, and the hold refuses it. A stale entry stays served through a failed refresh. Upgrade: fall back
    // to the last good catalog instead of the defaults.
    return parseDiscoverySourceCatalog(null);
  }
}
