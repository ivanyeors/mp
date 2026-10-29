import Anthropic from "@anthropic-ai/sdk";
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation";
import { getVercelOidcToken } from "@vercel/oidc";

/**
 * The one Claude client, and the credentials check, shared by review replies
 * (lib/reviews/draft-reply.ts) and AI writing (PRD-campaign-email-editor
 * slices 09, 10 and 17). Lifted out of draft-reply.ts: the check in slice 16,
 * the client in slice 09. Server-only.
 *
 * Credentials: an ANTHROPIC_API_KEY (local scripts), or on Vercel the OIDC
 * federation rule (ANTHROPIC_FEDERATION_RULE_ID + ORGANIZATION/SERVICE_ACCOUNT/
 * WORKSPACE ids) that swaps the function's x-vercel-oidc-token for a
 * short-lived Anthropic token — no long-lived secret in prod. The SDK prefers
 * the key when both are set. Nothing here, and nothing on General → AI
 * writing, stores a key: the credentials stay in Vercel.
 */

/** True when Claude can be called: an API key, or a Vercel OIDC federation rule. */
export function claudeConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_FEDERATION_RULE_ID?.trim());
}

export const CLAUDE_NOT_CONFIGURED = "Claude is not configured (ANTHROPIC_API_KEY or ANTHROPIC_FEDERATION_RULE_ID)";

/**
 * Server-side fallbacks (`fallbacks: "default"`): if a safety classifier
 * declines, the API carries on with Anthropic's recommended model inside the
 * same call instead of returning a refusal. Every call here opts in.
 */
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

let cachedClient: Anthropic | null = null;

/** The client, made once per instance; null without credentials. */
export function claudeClient(): Anthropic | null {
  if (!claudeConfigured()) return null;
  const federationRuleId = process.env.ANTHROPIC_FEDERATION_RULE_ID?.trim();
  // Bounded wall clock for a serverless function: 45s × (2 retries + 1). A
  // streamed call is bounded by its stream, not this.
  cachedClient ??= new Anthropic({
    timeout: 45_000,
    maxRetries: 2,
    credentials: federationRuleId
      ? oidcFederationProvider({
          // Per exchange, inside a request: Vercel re-mints its per-invocation token with Anthropic as the audience.
          identityTokenProvider: () => getVercelOidcToken({ audience: "https://api.anthropic.com" }),
          federationRuleId,
          organizationId: process.env.ANTHROPIC_ORGANIZATION_ID ?? "",
          serviceAccountId: process.env.ANTHROPIC_SERVICE_ACCOUNT_ID,
          workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
          baseURL: "https://api.anthropic.com",
          fetch,
        })
      : undefined,
  });
  return cachedClient;
}
