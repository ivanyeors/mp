import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_WRITING_NO_CREDENTIALS, AI_WRITING_SWITCHED_OFF } from "./availability";
import { claudeClient } from "./claude";
import { aiWritingLimited } from "./limits";
import { readAiWritingSettings } from "./settings";
import type { AiWritingSettings } from "./writing-settings";

export type AiWritingCall =
  | { ok: true; settings: AiWritingSettings; client: Anthropic }
  | { ok: false; status: number; error: string };

export async function openAiWritingCall(admin: SupabaseClient, memberId: string, { lead }: { lead?: string } = {}): Promise<AiWritingCall> {
  const read = await readAiWritingSettings(admin);
  if (!read.ok) return { ok: false, status: 503, error: read.error };
  const { settings } = read;
  if (!settings.enabled) return { ok: false, status: 403, error: AI_WRITING_SWITCHED_OFF };
  const client = await claudeClient();
  if (!client) return { ok: false, status: 503, error: AI_WRITING_NO_CREDENTIALS };
  const limited = await aiWritingLimited(settings, memberId, { lead });
  if (limited) return { ok: false, status: 429, error: limited };
  return { ok: true, settings, client };
}
