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
  | { ok: false; error: string; settings: AiWritingSettings };

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

export async function saveAiWritingSettings(admin: SupabaseClient, s: AiWritingSettings): Promise<void> {
  const updated_at = new Date().toISOString();
  const { error } = await admin
    .from("site_settings")
    .upsert(aiWritingSettingsToRows(s).map((r) => ({ ...r, updated_at })), { onConflict: "key" });
  if (error) throw new Error(`Could not save the AI writing settings: ${error.message}`);
}
