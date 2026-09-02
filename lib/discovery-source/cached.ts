import { unstable_cache } from "next/cache";
import { getDiscoverySourceCatalog } from "./index";

/**
 * The catalog lives in a single `site_settings` row read through the
 * service-role client, so it is cached under the shared `site-settings` tag.
 */
export const readDiscoverySourceCatalog = unstable_cache(
  () => getDiscoverySourceCatalog(),
  ["discovery-source-catalog"],
  { tags: ["site-settings"], revalidate: 300 },
);
