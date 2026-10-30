/**
 * The AI writing settings on the server (PRD-campaign-email-editor slice 16).
 * Server-only: it reads `site_settings` with the service role. Every AI
 * writing call (slices 09, 10, 17) reads them here first, uncached, so a change
 * on General → AI writing applies to the very next call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  AI_WRITING_DEFAULTS,
  AI_WRITING_SETTING_KEYS,
  aiWritingSettingsFromRows,
  aiWritingSettingsToRows,
  type AiWritingSettings,
} from "./writing-settings";

export const AI_WRITING_READ_FAILED = "Couldn't read the AI writing settings. Try again.";

export type AiWritingSettingsRead =
  | { ok: true; settings: AiWritingSettings }
  /** The read failed: AI writing is off for this call, whatever is stored. */
  | { ok: false; error: string; settings: AiWritingSettings };

/**
 * The settings as typed values; a stored value that no longer parses reads as
 * its default. A failed read turns AI writing off for that call
 * (`settings.enabled` false, with the reason), so a read error never turns on
 * what the owner turned off. Takes the client so tests pass a fake.
 */
export async function readAiWritingSettings(admin?: SupabaseClient): Promise<AiWritingSettingsRead> {
  try {
    const { data, error } = await (admin ?? supabaseAdmin())
      .from("site_settings")
      .select("key, value")
      .in("key", Object.values(AI_WRITING_SETTING_KEYS));
    if (error) throw new Error(error.message);
    return { ok: true, settings: aiWritingSettingsFromRows((data ?? []) as { key: string; value: string }[]) };
  } catch (e) {
    console.error("[ai-writing] settings read failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: AI_WRITING_READ_FAILED, settings: { ...AI_WRITING_DEFAULTS, enabled: false } };
  }
}

/** Saves the settings, already validated. */
export async function saveAiWritingSettings(admin: SupabaseClient, s: AiWritingSettings): Promise<void> {
  const updated_at = new Date().toISOString();
  const { error } = await admin
    .from("site_settings")
    .upsert(aiWritingSettingsToRows(s).map((r) => ({ ...r, updated_at })), { onConflict: "key" });
  if (error) throw new Error(`Could not save the AI writing settings: ${error.message}`);
}
