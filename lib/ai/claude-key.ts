import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ANTHROPIC_CONFIG_SLUG } from "./claude";

/**
 * The Claude API key the owner pastes on General (owner, 2026-10-30: "give me
 * the API key input for AI into our API page"). It is the first credential
 * lib/ai/claude.ts tries, for review replies and AI writing alike. It lives in
 * the `anthropic` row of `api_configs`, which only the service role reads,
 * and never goes back to the browser. Server-only.
 */

/** A pasted key: trimmed, one word. Anthropic says whether it works. */
export const ClaudeKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "Paste the whole key. It starts with sk-ant-")
    .max(500, "That's longer than an Anthropic API key")
    .regex(/^\S+$/, "A key has no spaces. Paste just the key"),
});

/** The client a key is checked with; tests pass their own. */
export type ClaudeKeyChecker = (apiKey: string) => Promise<void>;

/** Asks Anthropic for one model with the key: no tokens are used. Throws what Anthropic answered. */
export const askAnthropic: ClaudeKeyChecker = async (apiKey) => {
  await new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 }).models.list({ limit: 1 });
};

/** Pure — why a key was refused, in words for the owner. */
export function claudeKeyRefusal(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic didn't accept this key. Check it was copied whole, or make a new one.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This key can't use Claude. Make an API key in the Anthropic Console, not an admin key.";
  if (e instanceof Anthropic.APIError && e.status) return `Anthropic couldn't check the key (error ${e.status}). Try again in a minute.`;
  return "Couldn't reach Anthropic to check the key. Try again in a minute.";
}

/** Saves the key, active, in the `anthropic` row; the caller expires the `api-configs` cache. */
export async function saveClaudeKey(admin: SupabaseClient, apiKey: string): Promise<void> {
  const { error } = await admin.from("api_configs").upsert(
    {
      slug: ANTHROPIC_CONFIG_SLUG,
      name: "Claude (Anthropic)",
      base_url: "https://api.anthropic.com",
      api_key: apiKey,
      is_active: true,
    },
    { onConflict: "slug" },
  );
  if (error) throw new Error(error.message);
}

/** Removes the row, so the environment's credentials apply again. */
export async function removeClaudeKey(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("api_configs").delete().eq("slug", ANTHROPIC_CONFIG_SLUG);
  if (error) throw new Error(error.message);
}

/** Whether a key is saved, for the audit entry's before and after. */
export async function claudeKeySaved(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("api_configs").select("api_key").eq("slug", ANTHROPIC_CONFIG_SLUG).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean((data as { api_key: string | null } | null)?.api_key);
}
