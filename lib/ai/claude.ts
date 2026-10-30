import Anthropic from "@anthropic-ai/sdk";
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation";
import { getVercelOidcToken } from "@vercel/oidc";
import { readApiConfigs } from "@/lib/settings/api-configs";

/**
 * The one Claude client, and the credentials check, shared by review replies
 * (lib/reviews/draft-reply.ts) and AI writing (PRD-campaign-email-editor
 * slices 09, 10 and 17). Lifted out of draft-reply.ts: the check in slice 16,
 * the client in slice 09. Server-only.
 *
 * Credentials, the first that is set:
 * 1. The key the owner saved on General → Claude API key, held in the
 *    `anthropic` row of `api_configs` (service-role only, never sent to the
 *    browser; lib/ai/claude-key.ts writes it).
 * 2. An ANTHROPIC_API_KEY in the environment (local scripts, or Vercel).
 * 3. On Vercel, the OIDC federation rule (ANTHROPIC_FEDERATION_RULE_ID +
 *    ORGANIZATION/SERVICE_ACCOUNT/WORKSPACE ids) that swaps the function's
 *    x-vercel-oidc-token for a short-lived Anthropic token.
 */

/** The `api_configs` row that holds the key saved on General. */
export const ANTHROPIC_CONFIG_SLUG = "anthropic";

/** Where the client's credentials come from: what General's status line names. */
export type ClaudeCredentialSource = "saved" | "environment" | "federation";

type ClaudeCredentials =
  | { source: "saved" | "environment"; apiKey: string }
  | { source: "federation"; federationRuleId: string }
  | null;

/**
 * The saved key, when its row is active. Read through the `api-configs` cache,
 * which saving or removing the key expires. Outside the app (the eval scripts,
 * tests) there is no cache to read, so the environment's credentials apply.
 */
async function savedClaudeKey(): Promise<string | null> {
  try {
    const row = (await readApiConfigs()).find((c) => c.slug === ANTHROPIC_CONFIG_SLUG);
    return (row?.is_active && row.api_key?.trim()) || null;
  } catch (err) {
    if (process.env.NEXT_RUNTIME) console.error("[claude] saved key read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function claudeCredentials(): Promise<ClaudeCredentials> {
  const saved = await savedClaudeKey();
  if (saved) return { source: "saved", apiKey: saved };
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey) return { source: "environment", apiKey: envKey };
  const federationRuleId = process.env.ANTHROPIC_FEDERATION_RULE_ID?.trim();
  if (federationRuleId) return { source: "federation", federationRuleId };
  return null;
}

/** Where Claude's credentials come from, or null when none are set. */
export async function claudeCredentialSource(): Promise<ClaudeCredentialSource | null> {
  return (await claudeCredentials())?.source ?? null;
}

/** True when Claude can be called: a saved key, an API key, or a Vercel OIDC federation rule. */
export async function claudeConfigured(): Promise<boolean> {
  return (await claudeCredentials()) !== null;
}

export const CLAUDE_NOT_CONFIGURED = "Claude is not configured: add the Claude API key on General";

/**
 * Server-side fallbacks (`fallbacks: "default"`): if a safety classifier
 * declines, the API carries on with Anthropic's recommended model inside the
 * same call instead of returning a refusal. Every call here opts in.
 */
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Pure — the call was stopped from our side (Staff pressed Stop, or the request went away), not failed. */
export const isClaudeAbort = (e: unknown) => e instanceof Anthropic.APIUserAbortError || (e instanceof Error && e.name === "AbortError");

const utf8 = new TextEncoder();

/**
 * Counts what a stream writes, for its audit entry when it stops before its
 * end (a draft's block refused mid-answer, Staff's Stop): the API reports a
 * message's output tokens only as it ends, so a stopped one still reads as
 * its first token. The words it streamed, about four bytes to a token, are
 * the floor of what it spent; its thinking streams no words, so that part is
 * on the Anthropic Console's bill alone. Hook it up before the stream runs;
 * it returns the larger of `reported` and the count.
 */
export function streamedOutput(stream: { on(event: "text", listener: (delta: string) => void): unknown }): (reported: number) => number {
  let bytes = 0;
  stream.on("text", (delta) => {
    bytes += utf8.encode(delta).length;
  });
  return (reported) => Math.max(reported, Math.ceil(bytes / 4));
}

/** Pure — a failed call, in words for Staff. */
export function claudeCallError(e: unknown, fallback = "Claude couldn't answer."): string {
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a minute.";
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic rejected the credentials.";
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ""}: ${e.message}`.replace(/\s+:/, ":");
  return e instanceof Error ? e.message : fallback;
}

let cached: { credential: string; client: Anthropic } | null = null;

/** The client, made again only when its credentials change; null without them. */
export async function claudeClient(): Promise<Anthropic | null> {
  const creds = await claudeCredentials();
  if (!creds) return null;
  const credential = creds.source === "federation" ? `federation:${creds.federationRuleId}` : `key:${creds.apiKey}`;
  if (cached?.credential === credential) return cached.client;
  // Bounded wall clock for a serverless function: 45s × (2 retries + 1). A
  // streamed call is bounded by its stream, not this.
  const client = new Anthropic({
    timeout: 45_000,
    maxRetries: 2,
    ...(creds.source === "federation"
      ? {
          credentials: oidcFederationProvider({
            // Per exchange, inside a request: Vercel re-mints its per-invocation token with Anthropic as the audience.
            identityTokenProvider: () => getVercelOidcToken({ audience: "https://api.anthropic.com" }),
            federationRuleId: creds.federationRuleId,
            organizationId: process.env.ANTHROPIC_ORGANIZATION_ID ?? "",
            serviceAccountId: process.env.ANTHROPIC_SERVICE_ACCOUNT_ID,
            workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
            baseURL: "https://api.anthropic.com",
            fetch,
          }),
        }
      : { apiKey: creds.apiKey }),
  });
  cached = { credential, client };
  return client;
}
