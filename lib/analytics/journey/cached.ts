import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listJourneyFacetsFromDb } from "./aggregates";

/**
 * The Entry source and country filter options scan every Visit, and the
 * Prospect journey card reloads on every filter change. A new source or
 * country showing up a few minutes late is fine.
 */
export const readJourneyFacets = unstable_cache(
  () => listJourneyFacetsFromDb(supabaseAdmin()),
  ["prospect-journey-facets"],
  { revalidate: 300 },
);
