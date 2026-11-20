import Anthropic from "@anthropic-ai/sdk";
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation";
import { getVercelOidcToken } from "@vercel/oidc";
import { readApiConfigs } from "@/lib/settings/api-configs";

export const ANTHROPIC_CONFIG_SLUG = "anthropic";

export type ClaudeCredentialSource = "saved" | "environment" | "federation";

type ClaudeCredentials =
  | { source: "saved" | "environment"; apiKey: string }
  | { source: "federation"; federationRuleId: string }
  | null;

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

export async function claudeCredentialSource(): Promise<ClaudeCredentialSource | null> {
  return (await claudeCredentials())?.source ?? null;
}

export async function claudeConfigured(): Promise<boolean> {
  return (await claudeCredentials()) !== null;
}

export const CLAUDE_NOT_CONFIGURED = "Claude is not configured: add the Claude API key on General";

export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export const isClaudeAbort = (e: unknown) => e instanceof Anthropic.APIUserAbortError || (e instanceof Error && e.name === "AbortError");

const utf8 = new TextEncoder();

export function streamedOutput(stream: { on(event: "text", listener: (delta: string) => void): unknown }): (reported: number) => number {
  let bytes = 0;
  stream.on("text", (delta) => {
    bytes += utf8.encode(delta).length;
  });
  return (reported) => Math.max(reported, Math.ceil(bytes / 4));
}

export function claudeCallError(e: unknown, fallback = "Claude couldn't answer."): string {
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a minute.";
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic rejected the credentials.";
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ""}: ${e.message}`.replace(/\s+:/, ":");
  return e instanceof Error ? e.message : fallback;
}

let cached: { credential: string; client: Anthropic } | null = null;

export async function claudeClient(): Promise<Anthropic | null> {
  const creds = await claudeCredentials();
  if (!creds) return null;
  const credential = creds.source === "federation" ? `federation:${creds.federationRuleId}` : `key:${creds.apiKey}`;
  if (cached?.credential === credential) return cached.client;
  const client = new Anthropic({
    timeout: 45_000,
    maxRetries: 2,
    ...(creds.source === "federation"
      ? {
          credentials: oidcFederationProvider({
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
