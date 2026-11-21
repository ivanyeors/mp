import { readPointsSettings } from "@/lib/points/server";
import { pointsLive } from "@/lib/points/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function campaignPointsLive(): Promise<boolean> {
  try {
    return pointsLive(await readPointsSettings(supabaseAdmin()));
  } catch {
    return false;
  }
}
