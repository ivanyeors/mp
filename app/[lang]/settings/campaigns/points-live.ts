import { readPointsSettings } from "@/lib/points/server";
import { pointsLive } from "@/lib/points/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Whether points are live now, for the editor (PRD-campaign-email-editor
 * slice 13): *Points balance* can be put in only while they are. Unread, it
 * is false, so the Variable is greyed rather than the page failing; Save and
 * the points rule check again on the server.
 */
export async function campaignPointsLive(): Promise<boolean> {
  try {
    return pointsLive(await readPointsSettings(supabaseAdmin()));
  } catch {
    return false;
  }
}
