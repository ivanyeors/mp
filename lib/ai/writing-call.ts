/**
 * What every AI writing call checks on the server once its permission and
 * its request are in (PRD-campaign-email-editor slices 09, 10 and 17), in
 * order: the AI writing settings, read now (switched off, or unread, is no);
 * Claude's credentials; then the per-Staff limits, which count this call.
 * Server-only.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_WRITING_NO_CREDENTIALS, AI_WRITING_SWITCHED_OFF } from "./availability";
import { claudeClient } from "./claude";
import { aiWritingLimited } from "./limits";
import { readAiWritingSettings } from "./settings";
import type { AiWritingSettings } from "./writing-settings";

export type AiWritingCall =
  | { ok: true; settings: AiWritingSettings; client: Anthropic }
  /** Refused before Claude is asked: the status and the words to answer with. */
  | { ok: false; status: number; error: string };

/**
 * The settings and the client for one call by the Member `memberId`, or why
 * it can't run. `lead` opens the limit's refusal ("You've drafted a lot
 * today"), so each kind of call says it in its own words.
 */
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
