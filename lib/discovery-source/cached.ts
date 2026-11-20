import { unstable_cache } from "next/cache";
import { getDiscoverySourceCatalog } from "./index";

export const readDiscoverySourceCatalog = unstable_cache(
  () => getDiscoverySourceCatalog(),
  ["discovery-source-catalog"],
  { tags: ["site-settings"], revalidate: 300 },
);
