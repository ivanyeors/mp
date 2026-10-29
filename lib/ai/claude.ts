/**
 * The shared Claude credentials check, lifted out of `lib/reviews/draft-reply.ts`
 * so review replies and AI writing (PRD-campaign-email-editor) ask the same
 * question. Slice 09 lifts the client itself here too.
 *
 * Credentials: an ANTHROPIC_API_KEY (local scripts), or on Vercel the OIDC
 * federation rule (ANTHROPIC_FEDERATION_RULE_ID + ORGANIZATION/SERVICE_ACCOUNT/
 * WORKSPACE ids). Nothing here, and nothing on General → AI writing, stores a
 * key: the credentials stay in Vercel.
 */

/** True when Claude can be called: an API key, or a Vercel OIDC federation rule. */
export function claudeConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_FEDERATION_RULE_ID?.trim());
}

export const CLAUDE_NOT_CONFIGURED = "Claude is not configured (ANTHROPIC_API_KEY or ANTHROPIC_FEDERATION_RULE_ID)";
