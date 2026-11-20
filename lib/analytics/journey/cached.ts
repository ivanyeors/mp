import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listJourneyFacetsFromDb } from "./aggregates";

export const readJourneyFacets = unstable_cache(
  () => listJourneyFacetsFromDb(supabaseAdmin()),
  ["prospect-journey-facets"],
  { revalidate: 300 },
);
