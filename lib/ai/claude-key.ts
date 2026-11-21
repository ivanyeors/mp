import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ANTHROPIC_CONFIG_SLUG } from "./claude";

export const ClaudeKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "Paste the whole key. It starts with sk-ant-")
    .max(500, "That's longer than an Anthropic API key")
    .regex(/^\S+$/, "A key has no spaces. Paste just the key"),
});

export type ClaudeKeyChecker = (apiKey: string) => Promise<void>;

export const askAnthropic: ClaudeKeyChecker = async (apiKey) => {
  await new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 }).models.list({ limit: 1 });
};

export function claudeKeyRefusal(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic didn't accept this key. Check it was copied whole, or make a new one.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This key can't use Claude. Make an API key in the Anthropic Console, not an admin key.";
  if (e instanceof Anthropic.APIError && e.status) return `Anthropic couldn't check the key (error ${e.status}). Try again in a minute.`;
  return "Couldn't reach Anthropic to check the key. Try again in a minute.";
}

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

export async function removeClaudeKey(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("api_configs").delete().eq("slug", ANTHROPIC_CONFIG_SLUG);
  if (error) throw new Error(error.message);
}

export async function claudeKeySaved(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("api_configs").select("api_key").eq("slug", ANTHROPIC_CONFIG_SLUG).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean((data as { api_key: string | null } | null)?.api_key);
}
